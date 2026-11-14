/** Server-only audio boundary. The reader must authorize the storage object for the actor. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export type AudioReference = { storageKey: string; mimeType: string };
export type AudioFile = { bytes: Uint8Array; mimeType: string };
export type AudioActor = { businessId: string; verifiedSender: string };
export interface TrustedAudioReader {
  /** Enforce ownership, private storage, and maxBytes while reading, before buffering. No user URLs. */
  read(actor: AudioActor, reference: AudioReference, maxBytes: number): Promise<AudioFile>;
}
export interface AudioTranscriber {
  transcribe(audio: AudioFile): Promise<string>;
}
export class AudioError extends Error {
  constructor(public readonly code: 'INVALID_AUDIO' | 'AUDIO_TOO_LARGE' | 'TRANSCRIPTION_UNAVAILABLE' | 'INVALID_TRANSCRIPT',
    public readonly retryable = false) { super(code); }
}
const extensions: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
};
export function audioExtension(mimeType: string) {
  const extension = extensions[mimeType.split(';')[0].trim().toLowerCase()];
  if (!extension) throw new AudioError('INVALID_AUDIO');
  return extension;
}
export function validateAudio(audio: AudioFile) {
  audioExtension(audio.mimeType);
  if (!audio.bytes.byteLength) throw new AudioError('INVALID_AUDIO');
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) throw new AudioError('AUDIO_TOO_LARGE');
}
