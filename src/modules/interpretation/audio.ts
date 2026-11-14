import { AudioError, MAX_AUDIO_BYTES, audioExtension, validateAudio,
  type AudioActor, type AudioReference, type AudioTranscriber, type TrustedAudioReader } from '../media/audio';
import { interpretSaleMessage } from './parser';
import type { CatalogueProduct, InterpretationResult } from './types';

export type AudioPreparation = { text: string } | { clarification: string };
/** Only a verified storage adapter may supply audio. No writes and no command execution here. */
export function createAudioPreparation(deps: { reader: TrustedAudioReader; transcriber: AudioTranscriber }) {
  return async (actor: AudioActor, reference: AudioReference): Promise<AudioPreparation> => {
    if (!actor.businessId || !actor.verifiedSender || !reference.storageKey || reference.storageKey.length > 1024
      || /(?:^|\/)\.\.(?:\/|$)|:\/\//.test(reference.storageKey)) throw new AudioError('INVALID_AUDIO');
    try {
      audioExtension(reference.mimeType);
      const audio = await deps.reader.read(actor, reference, MAX_AUDIO_BYTES);
      validateAudio(audio);
      if (audioExtension(audio.mimeType) !== audioExtension(reference.mimeType)) throw new AudioError('INVALID_AUDIO');
      const text = (await deps.transcriber.transcribe(audio)).trim();
      if (!text || text.length > 2000) return { clarification: 'No pude obtener una venta clara del audio. Escribe los productos y cantidades o envía otra grabación.' };
      return { text };
    } catch (error) {
      if (!(error instanceof AudioError) || error.retryable) throw error;
      return { clarification: error.code === 'AUDIO_TOO_LARGE'
        ? 'El audio supera 10 MB. Envía una grabación más pequeña o escribe la venta.'
        : 'No pude procesar ese audio. Escribe la venta o envía otra grabación en un formato compatible.' };
    }
  };
}
export function interpretAudioTranscript(text: string, catalogue: CatalogueProduct[], selections: Record<string, string> = {}): InterpretationResult {
  // Even a spoken CONFIRMAR/ELEGIR/ALTA must never execute commands or approve a draft.
  const result = interpretSaleMessage({ text }, catalogue, selections);
  return { ...result, needsConfirmation: result.intent === 'sale' || result.intent === 'expense' || result.needsConfirmation };
}
