export type WhatsAppActor = { businessId: string; verifiedSender: string; channel: 'whatsapp' };
export type InboundMessage = {
  provider: 'infobip'; providerMessageId: string; from: string; to: string;
  receivedAt: string; kind: 'text' | 'audio' | 'unsupported'; text?: string;
  /** Internal only: attached by an authenticated adapter after private storage/ownership validation. */
  audio?: { storageKey: string; mimeType: string };
};
export interface MessagingProvider {
  sendText(input: { to: string; text: string; receivedAt: string; messageId: string }): Promise<void>;
  sendTemplate(input: { to: string; name: string; language: string; placeholders: string[]; messageId: string }): Promise<void>;
}
export class MessagingError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) { super(code); }
}
