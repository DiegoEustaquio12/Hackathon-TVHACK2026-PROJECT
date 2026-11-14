import { z } from 'zod';
import { MessagingError, type InboundMessage, type MessagingProvider } from './contracts';
import { parseInfobipInbound } from './infobip';
/** Must atomically claim/lease the event and persist its reply BEFORE returning it.
 * Retries replay the stored reply; failures release the lease. No in-memory production implementation. */
export interface DurableProcessing {
  run(message: InboundMessage, process: () => Promise<string>): Promise<string>;
}
export function createInfobipWebhook(deps: {
  authenticate(headers: Headers): boolean | Promise<boolean>;
  recipient: string; processing: DurableProcessing; conversation(message: InboundMessage): Promise<string>;
  provider: MessagingProvider;
}) {
  return async function handleInfobipWebhook(input: { rawBody: string; headers: Headers }) {
    if (Buffer.byteLength(input.rawBody, 'utf8') > 256 * 1024) return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } };
    if (!await deps.authenticate(input.headers)) return { status: 401, body: { code: 'UNAUTHORIZED' } };
    if (input.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return { status: 415, body: { code: 'JSON_REQUIRED' } };
    let messages: InboundMessage[];
    try { messages = parseInfobipInbound(JSON.parse(input.rawBody), deps.recipient); }
    catch { return { status: 400, body: { code: 'INVALID_PAYLOAD' } }; }
    try {
      for (const message of messages) {
        const text = await deps.processing.run(message, () => deps.conversation(message));
        await deps.provider.sendText({ to: message.from, text, receivedAt: message.receivedAt, messageId: `reply:${message.providerMessageId}` });
      }
      return { status: 200, body: { accepted: messages.length } };
    } catch (error) {
      if (error instanceof z.ZodError) return { status: 422, body: { code: 'INVALID_DOMAIN_INPUT' } };
      if (error instanceof MessagingError && !error.retryable) return { status: 422, body: { code: error.code } };
      return { status: 503, body: { code: 'PROCESSING_UNAVAILABLE' } };
    }
  };
}
