import { createHmac, timingSafeEqual } from 'node:crypto';
/** Integrity only, not encryption. Never put secrets in a continuation. */
export function createContinuations(secret: string, now = Date.now) {
  if (Buffer.byteLength(secret) < 32) throw new Error('Continuation key required');
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
  return {
    issue(sender: string, kind: string, data: unknown) {
      const payload = Buffer.from(JSON.stringify({ sender, kind, data, expires: now() + 900000 })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    read(token: string, sender: string, kind: string): unknown {
      if (token.length > 20000) throw new Error('Invalid continuation');
      const [payload, signature, extra] = token.split('.');
      const expected = Buffer.from(sign(payload ?? '')), actual = Buffer.from(signature ?? '');
      if (extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid continuation');
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (value.sender !== sender || value.kind !== kind || !Number.isSafeInteger(value.expires) || value.expires <= now()) throw new Error('Invalid continuation');
      return value.data;
    },
  };
}
