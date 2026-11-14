import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { actorSchema, type Actor } from '../../contracts/common';
import type { IdentityStore } from './sessions';
/** Privileged server-only adapter; requires the proposed R1 storage migration. */
export function createSupabaseIdentityStore(client: SupabaseClient): IdentityStore {
  return {
    async consumeLink(hash, now) {
      const { data, error } = await client.rpc('r2_consume_link', { p_hash: hash, p_now: now });
      if (error) throw error;
      return data ? actorSchema.omit({ sessionId: true }).parse(data) : null;
    },
    async createSession(hash, record) {
      const { error } = await client.from('r2_sessions').insert({ token_hash: hash, actor: record.actor, expires_at: record.expiresAt, revoked_at: record.revokedAt });
      if (error) throw error;
    },
    async getSession(hash) {
      const { data, error } = await client.from('r2_sessions').select('actor,expires_at,revoked_at').eq('token_hash', hash).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const value = z.object({ actor: actorSchema, expires_at: z.number().int(), revoked_at: z.number().int().nullable() }).parse(data);
      return { actor: value.actor, expiresAt: value.expires_at, revokedAt: value.revoked_at };
    },
    async revokeSession(hash, now) {
      const { error } = await client.from('r2_sessions').update({ revoked_at: now }).eq('token_hash', hash);
      if (error) throw error;
    },
  };
}
/** Caller must resolve this identity from verified Supabase authentication, never client form data. */
export async function issueVerifiedIdentityLink(client: SupabaseClient, identity: Omit<Actor, 'sessionId'>, now = Date.now()) {
  const actor = actorSchema.omit({ sessionId: true }).parse(identity);
  const token = randomBytes(32).toString('base64url');
  const { error } = await client.from('r2_links').insert({ token_hash: createHash('sha256').update(token).digest('hex'), actor, expires_at: now + 900000 });
  if (error) throw error;
  return token;
}
