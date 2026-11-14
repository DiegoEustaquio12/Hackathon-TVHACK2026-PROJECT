import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ProcessingStore } from './processing';
import type { InboundMessage } from './contracts';
const claimSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('busy') }), z.object({ state: z.literal('completed'), reply: z.string() }),
  z.object({ state: z.literal('claimed'), leaseId: z.string().uuid() }),
]);
/** Requires migration 202611140007_role2_durable_storage.sql. Service role client only. */
export function createSupabaseProcessingStore(client: SupabaseClient): ProcessingStore {
  const key = (m: InboundMessage) => `${m.provider}:${m.providerMessageId}`;
  async function finish(m: InboundMessage, lease: string, reply: string | null) {
    const { error } = await client.rpc('r2_finish_event', { p_key: key(m), p_lease: lease, p_reply: reply });
    if (error) throw error;
  }
  return {
    async claim(m) {
      const { data, error } = await client.rpc('r2_claim_event', { p_key: key(m), p_sender: m.from, p_recipient: m.to, p_payload: m });
      if (error) throw error;
      return claimSchema.parse(data);
    },
    complete: finish,
    fail: (m, lease) => finish(m, lease, null),
  };
}
