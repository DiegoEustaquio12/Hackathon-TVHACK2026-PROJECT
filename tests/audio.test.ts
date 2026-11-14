import { expect, it, vi } from 'vitest';
import { createOpenAIAudioTranscriber } from '../src/modules/media/openai-transcriber';
import { AudioError, MAX_AUDIO_BYTES } from '../src/modules/media/audio';
import { createAudioPreparation, interpretAudioTranscript } from '../src/modules/interpretation/audio';
import { interpretSaleMessage } from '../src/modules/interpretation/parser';
import { createConversation, type ConversationDependencies } from '../src/modules/orchestration/conversation';
import { createChoices } from '../src/modules/orchestration/choices';
import type { InboundMessage } from '../src/modules/messaging/contracts';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const actor = { businessId: ids[0], verifiedSender: '525555555555', channel: 'whatsapp' as const };
const reference = { storageKey: `${ids[0]}/voice.ogg`, mimeType: 'audio/ogg; codecs=opus' };
const audio = { bytes: new Uint8Array([79, 103, 103, 83]), mimeType: 'audio/ogg' };
const message: InboundMessage = { provider: 'infobip', providerMessageId: 'voice-1', from: actor.verifiedSender,
  to: '19999999999', receivedAt: new Date().toISOString(), kind: 'audio', audio: reference };
const catalogue = [
  { id: ids[1], name: 'Coca 600 ml', aliases: ['coca'], sale_price_cents: 2000, stock: 10, sale_unit: 'piece' as const },
  { id: ids[2], name: 'Coca 2 l', aliases: ['coca'], sale_price_cents: 4000, stock: 10, sale_unit: 'piece' as const },
];

it('sends multipart audio to the fixed OpenAI endpoint with gpt-transcribe and Spanish hint', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ text: ' Vendí 3 cocas 600 ml. ', languages: [{ code: 'es' }] }));
  const transcriber = createOpenAIAudioTranscriber({ apiKey: 'fixture-key' }, fetcher);
  expect(await transcriber.transcribe(audio)).toBe('Vendí 3 cocas 600 ml.');
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
  expect(request?.redirect).toBe('error');
  expect(request?.headers).toEqual({ Authorization: 'Bearer fixture-key' });
  const form = request?.body as FormData;
  expect(form.get('model')).toBe('gpt-transcribe');
  expect(form.get('languages[]')).toBe('es');
  expect((form.get('file') as File).name).toBe('audio.ogg');
});

it.each([
  { bytes: new Uint8Array(), mimeType: 'audio/ogg' },
  { bytes: new Uint8Array(MAX_AUDIO_BYTES + 1), mimeType: 'audio/ogg' },
  { bytes: audio.bytes, mimeType: 'image/png' },
])('rejects unsupported, empty or oversized files before calling OpenAI', async file => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(createOpenAIAudioTranscriber({ apiKey: 'fixture' }, fetcher).transcribe(file)).rejects.toBeInstanceOf(AudioError);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([429, 500, 503])('keeps provider %s failures retryable without leaking credentials or body', async status => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('sensitive provider body', { status }));
  await expect(createOpenAIAudioTranscriber({ apiKey: 'secret-fixture' }, fetcher).transcribe(audio))
    .rejects.toMatchObject({ message: 'TRANSCRIPTION_UNAVAILABLE', retryable: true });
});

it('handles permanent provider rejection and malformed transcripts without inventing a sale', async () => {
  await expect(createOpenAIAudioTranscriber({ apiKey: 'fixture' }, async () => new Response('', { status: 401 })).transcribe(audio))
    .rejects.toMatchObject({ retryable: false });
  for (const payload of [{}, { text: 'x'.repeat(2001) }]) {
    await expect(createOpenAIAudioTranscriber({ apiKey: 'fixture' }, async () => Response.json(payload)).transcribe(audio))
      .rejects.toMatchObject({ code: 'INVALID_TRANSCRIPT' });
  }
  await expect(createOpenAIAudioTranscriber({ apiKey: 'fixture' }, async () => { throw new Error('network secret'); }).transcribe(audio))
    .rejects.toMatchObject({ message: 'TRANSCRIPTION_UNAVAILABLE', retryable: true });
});

it('passes the verified actor and byte limit to private storage; silence asks for clarification', async () => {
  const read = vi.fn(async () => audio);
  const prepare = createAudioPreparation({ reader: { read }, transcriber: { transcribe: async () => '' } });
  expect(await prepare(actor, reference)).toHaveProperty('clarification');
  expect(read).toHaveBeenCalledWith(actor, reference, MAX_AUDIO_BYTES);
  await expect(prepare(actor, { ...reference, storageKey: 'https://attacker.test/audio' })).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  await expect(prepare(actor, { ...reference, storageKey: '../other/audio' })).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  expect(read).toHaveBeenCalledTimes(1);
});

it('propagates storage authorization errors without transcription and transient errors for retry', async () => {
  const transcribe = vi.fn();
  const prepare = createAudioPreparation({ reader: { read: async () => { throw new Error('Forbidden'); } }, transcriber: { transcribe } });
  await expect(prepare(actor, reference)).rejects.toThrow('Forbidden');
  expect(transcribe).not.toHaveBeenCalled();
  const unavailable = createAudioPreparation({ reader: { read: async () => audio }, transcriber: {
    transcribe: async () => { throw new AudioError('TRANSCRIPTION_UNAVAILABLE', true); },
  } });
  await expect(unavailable(actor, reference)).rejects.toMatchObject({ retryable: true });
});

function conversation(transcript: string) {
  const createDraft = vi.fn<ConversationDependencies['createDraft']>(async () => ({
    draft_id: ids[0], status: 'pending', quote_version: 1, expires_at: '2026-11-15T12:15:00Z',
    quote: { total_cents: 2000, items: [{ product_id: ids[1], description: 'Coca 600 ml', quantity: 1, unit_price_cents: 2000, subtotal_cents: 2000 }] },
  }));
  const confirmDraft = vi.fn<ConversationDependencies['confirmDraft']>(async () => ({ status: 'confirmed', receipt: {
    sale_id: ids[0], total_cents: 2000, replayed: false, items: [{ product_id: ids[1], description: 'Coca 600 ml', quantity: 1, unit_price_cents: 2000, subtotal_cents: 2000 }],
  } }));
  const prepareAudio = vi.fn(createAudioPreparation({ reader: { read: async () => audio }, transcriber: { transcribe: async () => transcript } }));
  const deps = { resolveActor: async () => actor, prepareAudio, createDraft, confirmDraft, cancelDraft: vi.fn(),
    choices: createChoices('a'.repeat(32)), interpret: async (_actor: unknown, request: { text: string }) => interpretSaleMessage(request, catalogue),
    interpretSelection: async (_actor: unknown, text: string, selections: Record<string, string>) => interpretSaleMessage({ text }, catalogue, selections),
  };
  return { run: createConversation(deps), createDraft, confirmDraft, prepareAudio, deps };
}

it('keeps audio presentation clarification, then drafts, and only records after a text confirmation', async () => {
  const test = conversation('Vendí una coca');
  const first = await test.run(message);
  expect(first).toContain('Transcripción: «Vendí una coca»');
  expect(first).toContain('¿Cuál');
  expect(test.createDraft).not.toHaveBeenCalled();
  expect(test.confirmDraft).not.toHaveBeenCalled();
  const choose = first.split('\n').find(line => line.startsWith('ELEGIR '))!;
  const summary = await test.run({ ...message, kind: 'text', providerMessageId: 'choice', text: choose });
  expect(summary).toContain('No se ha registrado la venta');
  expect(test.createDraft).toHaveBeenCalledWith(message.from, 'infobip:voice-1', [{ product_id: ids[1], quantity: 1 }]);
  expect(test.confirmDraft).not.toHaveBeenCalled();
  expect(test.prepareAudio).toHaveBeenCalledTimes(1);
  const confirmation = summary.match(/CONFIRMAR [a-f0-9-]{36} \d+/)![0];
  expect(await test.run({ ...message, kind: 'text', providerMessageId: 'approval', text: confirmation })).toContain('Venta registrada');
  expect(test.confirmDraft).toHaveBeenCalledWith(message.from, ids[0], 1);
});

it.each([`CONFIRMAR ${ids[0]} 1`, `CANCELAR ${ids[0]}`, 'CONFIRMAR GASTO token', 'CANCELAR GASTO', 'ELEGIR token 1', 'CONFIRMAR ALTA token'])
('never executes a spoken command: %s', async transcript => {
  const test = conversation(transcript);
  await test.run(message);
  expect(test.createDraft).not.toHaveBeenCalled();
  expect(test.confirmDraft).not.toHaveBeenCalled();
  expect(test.deps.cancelDraft).not.toHaveBeenCalled();
});

it.each(['Vendí una coca 600 ml', 'Vendí una coca 600 ml a $1', 'Vendí 100 cocas', 'Vendí media coca', 'Vendí un jabón'])
('preserves deterministic validation and confirmation for transcript %s', text => {
  const result = interpretAudioTranscript(text, catalogue);
  expect(result.needsConfirmation).toBe(true);
  if (text !== 'Vendí una coca 600 ml') expect(result.data.items).toBeUndefined();
});

it('does not read audio before onboarding or when the channel has no trusted audio adapter', async () => {
  const test = conversation('Vendí una coca');
  const unknown = createConversation({ ...test.deps, resolveActor: async () => null });
  await unknown(message);
  expect(test.prepareAudio).not.toHaveBeenCalled();
  const disabled = createConversation({ ...test.deps, prepareAudio: undefined });
  expect(await disabled(message)).toContain('todavía no está disponible');
  expect(test.createDraft).not.toHaveBeenCalled();
});
