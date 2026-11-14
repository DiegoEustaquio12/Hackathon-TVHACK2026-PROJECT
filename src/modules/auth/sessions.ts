import { createHash, randomBytes } from 'node:crypto';
import { actorSchema, type Actor } from '../../contracts/common';
import type { SessionVerifier } from '../../contracts/services';
export type SessionRecord = { actor: Actor; expiresAt: number; revokedAt: number | null };
/** Implement with durable server storage. consumeLink must atomically consume once and check expiry/revocation. */
export interface IdentityStore {
  consumeLink(hash: string, now: number): Promise<Omit<Actor, 'sessionId'> | null>;
  createSession(hash: string, record: SessionRecord): Promise<void>;
  getSession(hash: string): Promise<SessionRecord | null>;
  revokeSession(hash: string, now: number): Promise<void>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export function createSessionService(store: IdentityStore, now = Date.now) {
  const cookieName = '__Host-knectan';
  return {
    async redeemLink(token: string) {
      if (!validToken(token)) throw new Error('Invalid link');
      const identity = await store.consumeLink(hash(token), now());
      if (!identity) throw new Error('Invalid or expired link');
      const actor = actorSchema.parse({ ...identity, sessionId: crypto.randomUUID() });
      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = now() + 6 * 60 * 60 * 1000;
      await store.createSession(hash(sessionToken), { actor, expiresAt, revokedAt: null });
      return { actor, cookie: `${cookieName}=${sessionToken}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=21600` };
    },
    async verify(request: Request): Promise<Actor | null> {
      const cookies = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${cookieName}=`));
      if (cookies.length !== 1) return null;
      const token = cookies[0].slice(cookieName.length + 1);
      if (!validToken(token)) return null;
      const session = await store.getSession(hash(token));
      if (!session || session.revokedAt !== null || !Number.isFinite(session.expiresAt) || session.expiresAt <= now()) return null;
      return actorSchema.parse(session.actor);
    },
    async revoke(token: string) { if (validToken(token)) await store.revokeSession(hash(token), now()); },
  } satisfies SessionVerifier & Record<string, unknown>;
}
