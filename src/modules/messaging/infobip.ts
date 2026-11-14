import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { MessagingError, type InboundMessage, type MessagingProvider } from './contracts';

export const phoneSchema = z.string().regex(/^\+?[1-9][0-9]{7,14}$/).transform(v => v.replace(/^\+/, ''));
const inboundSchema = z.object({ results: z.array(z.object({
  messageId: z.string().min(1).max(190), from: phoneSchema, to: phoneSchema,
  receivedAt: z.string().refine(v => /(?:Z|[+-]\d{2}:?\d{2})$/.test(v) && Number.isFinite(Date.parse(v))),
  message: z.object({ type: z.string(), text: z.string().max(4096).optional() }),
})).min(1).max(100) });
export function parseInfobipInbound(payload: unknown, recipient: string): InboundMessage[] {
  const expected = phoneSchema.parse(recipient);
  return inboundSchema.parse(payload).results.map(v => {
    if (v.to !== expected) throw new MessagingError('INVALID_RECIPIENT', false);
    if (v.message.type === 'TEXT' && !v.message.text?.trim()) throw new MessagingError('INVALID_TEXT', false);
    return { provider: 'infobip', providerMessageId: v.messageId, from: v.from, to: v.to,
      receivedAt: new Date(v.receivedAt).toISOString(), kind: v.message.type === 'TEXT' ? 'text' : 'unsupported',
      ...(v.message.type === 'TEXT' ? { text: v.message.text } : {}) };
  });
}
/** Configure this same Basic profile in Infobip over HTTPS. No implicit/default secret. */
export function basicWebhookAuthenticator(username: string, password: string) {
  if (!username || password.length < 24) throw new Error('Webhook credentials required');
  const expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
  return (headers: Headers) => {
    const actual = Buffer.from(headers.get('authorization') ?? '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
}
const receipt = z.object({ messageId: z.string().min(1), status: z.object({ groupId: z.number(), id: z.number() }) });
export class InfobipMessagingProvider implements MessagingProvider {
  private readonly origin: string;
  constructor(private readonly config: { baseUrl: string; apiKey: string; sender: string; timeoutMs?: number },
    private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.api.infobip.com') || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !config.apiKey) throw new Error('Invalid Infobip configuration');
    this.origin = url.origin;
    phoneSchema.parse(config.sender);
  }
  private async send(path: string, body: unknown, template = false) {
    try {
      const response = await this.fetcher(`${this.origin}/whatsapp/1/message/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs ?? 8000),
        headers: { Authorization: `App ${this.config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new MessagingError('PROVIDER_REJECTED', response.status === 429 || response.status >= 500);
      const payload = await response.json();
      const receipts = template ? z.object({ messages: z.array(receipt).min(1) }).parse(payload).messages : [receipt.parse(payload)];
      if (receipts.some(r => ![1, 3].includes(r.status.groupId))) throw new MessagingError('MESSAGE_REJECTED', false);
    } catch (error) {
      if (error instanceof MessagingError) throw error;
      throw new MessagingError('PROVIDER_UNAVAILABLE', true);
    }
  }
  async sendText(input: { to: string; text: string; receivedAt: string; messageId: string }) {
    const elapsed = this.now() - Date.parse(input.receivedAt);
    if (!Number.isFinite(elapsed) || elapsed < -60000 || elapsed >= 86400000) throw new MessagingError('TEMPLATE_REQUIRED', false);
    await this.send('text', { from: this.config.sender, to: phoneSchema.parse(input.to), messageId: input.messageId,
      content: { text: z.string().min(1).max(4096).parse(input.text) } });
  }
  async sendTemplate(input: { to: string; name: string; language: string; placeholders: string[]; messageId: string }) {
    await this.send('template', { messages: [{ from: this.config.sender, to: phoneSchema.parse(input.to), messageId: input.messageId,
      content: { templateName: z.string().min(1).parse(input.name), language: z.string().min(1).parse(input.language),
        templateData: { body: { placeholders: input.placeholders } } } }] }, true);
  }
}
