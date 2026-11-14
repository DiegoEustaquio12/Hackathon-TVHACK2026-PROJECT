import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
const phone = z.string().regex(/^[1-9][0-9]{7,14}$/);
export function createExpenseDraftRepository(client: SupabaseClient) {
  return {
    async propose(input: { verifiedSender: string; operationKey: string; concept: string; amountCents: number; occurredAt: string }) {
      const data = z.object({ verifiedSender: phone, operationKey: z.string().min(1).max(200),
        concept: z.string().trim().min(1).max(200), amountCents: z.number().int().positive().max(2147483647),
        occurredAt: z.iso.datetime({ offset: true }),
      }).strict().parse(input);
      const result = await client.rpc('r2_propose_expense', { p_sender:data.verifiedSender,p_key:data.operationKey,
        p_concept:data.concept,p_amount:data.amountCents,p_occurred_at:data.occurredAt });
      if (result.error) throw result.error;
      return z.object({ draft_id:z.string().uuid(),status:z.enum(['pending','confirmed','cancelled']),expires_at:z.string() }).parse(result.data);
    },
    async confirm(verifiedSender: string, draftId: string) {
      const result = await client.rpc('r2_confirm_expense',{p_sender:phone.parse(verifiedSender),p_draft_id:z.string().uuid().parse(draftId)});
      if (result.error) throw result.error;
      return z.object({ concept:z.string(),amount_cents:z.number().int().positive() }).parse(result.data);
    },
    async cancel(verifiedSender: string, draftId?: string) {
      const result = await client.rpc('r2_cancel_expense',{p_sender:phone.parse(verifiedSender),p_draft_id:draftId ? z.string().uuid().parse(draftId) : null});
      if (result.error) throw result.error;
      return z.number().int().nonnegative().parse(result.data);
    },
  };
}
