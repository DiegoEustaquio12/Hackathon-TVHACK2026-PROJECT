import { z } from 'zod';
import { AudioError, audioExtension, validateAudio, type AudioFile, type AudioTranscriber } from './audio';

/** Fixed OpenAI origin; credentials and provider response bodies never enter public errors. */
export function createOpenAIAudioTranscriber(config: { apiKey: string; timeoutMs?: number },
  fetcher: typeof fetch = fetch): AudioTranscriber {
  if (!config.apiKey.trim()) throw new Error('OPENAI_API_KEY required');
  const timeoutMs = config.timeoutMs ?? 20000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) throw new Error('Invalid transcription timeout');
  return {
    async transcribe(audio: AudioFile) {
      validateAudio(audio);
      const body = new FormData();
      body.set('model', 'gpt-transcribe');
      body.set('languages[]', 'es');
      body.set('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType.split(';')[0] }),
        `audio.${audioExtension(audio.mimeType)}`);
      try {
        const response = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: `Bearer ${config.apiKey}` }, body,
        });
        if (!response.ok) throw new AudioError('TRANSCRIPTION_UNAVAILABLE', response.status === 429 || response.status >= 500);
        const parsed = z.object({ text: z.string().trim().max(2000) }).safeParse(await response.json());
        if (!parsed.success) throw new AudioError('INVALID_TRANSCRIPT');
        return parsed.data.text;
      } catch (error) {
        if (error instanceof AudioError) throw error;
        throw new AudioError('TRANSCRIPTION_UNAVAILABLE', true);
      }
    },
  };
}
