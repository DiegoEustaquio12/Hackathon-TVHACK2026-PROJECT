import { describe, expect, it, vi } from 'vitest';
import { basicWebhookAuthenticator, parseInfobipInbound, InfobipMessagingProvider } from '../src/modules/messaging/infobip';
import { createConversation } from '../src/modules/orchestration/conversation';
import { createInfobipWebhook } from '../src/modules/messaging/webhook';
const sender = '525555555555', recipient = '447860088970';
const payload = { results: [{ messageId: 'fixture-1', from: sender, to: recipient,
  receivedAt: '2026-11-14T12:00:00.000+0000', message: { type: 'TEXT', text: 'Vendí 3 cocas y 2 panes' } }] };
const message = parseInfobipInbound(payload, recipient)[0];
const draftId = '00000000-0000-4000-8000-000000000001';
function dependencies() {
  return {
    resolveActor: vi.fn(async () => ({ businessId: 'fixture', verifiedSender: sender, channel: 'whatsapp' as const })),
    interpret: vi.fn(async () => ({ intent: 'sale' as const, confidence: 1, needsConfirmation: true, data: { items: [{ product_id: draftId, quantity: 3 }] } })),
    summarize: vi.fn(async () => '3 cocas: $60.00 MXN'),
    createDraft: vi.fn(async () => ({ draft_id: draftId, status: 'pending' as const, expires_at: '2026-11-14T12:15:00Z', quote_version: 1, quote: { items: [{ product_id: draftId, description: 'cocas', quantity: 3, unit_price_cents: 2000, subtotal_cents: 6000 }], total_cents: 6000 } })), confirmDraft: vi.fn(async () => ({ status: 'confirmed' as const, receipt: { sale_id: draftId, total_cents: 6000, replayed: false, items: [] } })), cancelDraft: vi.fn(async () => {}),
  };
}
describe('Role 2', () => {
  it('normalizes documented inbound shape and rejects delivery reports and wrong recipients', () => {
    expect(message.receivedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(() => parseInfobipInbound(payload, sender)).toThrow();
    expect(() => parseInfobipInbound({ results: [{ messageId: 'delivery', status: {} }] }, recipient)).toThrow();
  });
  it('authenticates only configured Basic credentials', () => {
    const auth = basicWebhookAuthenticator('fixture', 'a'.repeat(32));
    expect(auth(new Headers())).toBe(false);
    expect(auth(new Headers({ authorization: `Basic ${Buffer.from(`fixture:${'a'.repeat(32)}`).toString('base64')}` }))).toBe(true);
  });
  it('creates a stable draft and never registers a sale before explicit confirmation', async () => {
    const deps = dependencies(), conversation = createConversation(deps);
    expect(await conversation(message)).toContain(`CONFIRMAR ${draftId}`);
    expect(deps.createDraft.mock.calls[0]).toEqual([sender, 'infobip:fixture-1', [{ product_id: draftId, quantity: 3 }]]);
    expect(deps.confirmDraft).not.toHaveBeenCalled();
    await conversation({ ...message, text: 'sí' });
    expect(deps.confirmDraft).not.toHaveBeenCalled();
    expect(await conversation({ ...message, text: `CONFIRMAR ${draftId} 1` })).toContain('$60.00');
    expect(deps.confirmDraft).toHaveBeenCalledWith(sender, draftId, 1);
  });
  it('does not operate when sender is unlinked or interpretation is uncertain', async () => {
    const deps = dependencies();
    deps.resolveActor.mockResolvedValueOnce(null as never);
    await createConversation(deps)(message);
    expect(deps.interpret).not.toHaveBeenCalled();
    deps.interpret.mockResolvedValueOnce({ intent: 'sale', confidence: 0.2, needsConfirmation: true, data: { items: [] } });
    await createConversation(deps)(message);
    expect(deps.createDraft).not.toHaveBeenCalled();
  });
  it('uses the text endpoint and never exposes provider error body', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => { void _url; void _init; return new Response('secret upstream error', { status: 503 }); });
    const provider = new InfobipMessagingProvider({ baseUrl: 'https://fixture.api.infobip.com', apiKey: 'fixture', sender: recipient }, fetcher, () => Date.parse(message.receivedAt));
    await expect(provider.sendText({ to: sender, text: 'Hola', messageId: 'reply-1', receivedAt: message.receivedAt })).rejects.toMatchObject({ code: 'PROVIDER_REJECTED', retryable: true });
    expect(fetcher.mock.calls[0][0]).toContain('/whatsapp/1/message/text');
  });
  it('does not acknowledge processing failures or call dependencies for unauthenticated requests', async () => {
    const run = vi.fn(async () => { throw new Error('database secret'); });
    const handler = createInfobipWebhook({ authenticate: headers => headers.has('authorization'), recipient,
      processing: { run }, conversation: createConversation(dependencies()), provider: { sendText: vi.fn(), sendTemplate: vi.fn() } });
    expect((await handler({ rawBody: JSON.stringify(payload), headers: new Headers() })).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    const result = await handler({ rawBody: JSON.stringify(payload), headers: new Headers({ authorization: 'fixture', 'content-type': 'application/json' }) });
    expect(result).toEqual({ status: 503, body: { code: 'PROCESSING_UNAVAILABLE' } });
  });
});

import { createDurableProcessing } from '../src/modules/messaging/processing';
import { createSessionService, type SessionRecord } from '../src/modules/auth/sessions';
it('replays a durable reply without rerunning a sale', async () => {
  const process = vi.fn(async () => 'receipt');
  const processing = createDurableProcessing({ claim: async () => ({ state: 'completed', reply: 'stored receipt' }), complete: vi.fn(), fail: vi.fn() });
  expect(await processing.run(message, process)).toBe('stored receipt');
  expect(process).not.toHaveBeenCalled();
});
it('stores only token hashes and rejects revoked and expired sessions', async () => {
  let record: SessionRecord | null = null;
  let currentTime = 1000;
  let consumed = false;
  const service = createSessionService({
    consumeLink: async () => { if (consumed) return null; consumed = true; return { businessId: 'trusted', userId: 'user', channel: 'web' }; },
    createSession: async (hash, value) => { expect(hash).toMatch(/^[a-f0-9]{64}$/); record = value; },
    getSession: async () => record,
    revokeSession: async () => { if (record) record.revokedAt = currentTime; },
  }, () => currentTime);
  const { cookie } = await service.redeemLink('a'.repeat(43));
  expect(cookie).toContain('Secure; HttpOnly');
  const request = new Request('https://example.test', { headers: { cookie: cookie.split(';')[0] } });
  expect((await service.verify(request))?.businessId).toBe('trusted');
  await expect(service.redeemLink('a'.repeat(43))).rejects.toThrow();
  currentTime += 21600001;
  expect(await service.verify(request)).toBeNull();
  currentTime = 1000;
  await service.revoke(cookie.split(';')[0].split('=')[1]);
  expect(await service.verify(request)).toBeNull();
});
