import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createSaleDraft, confirmSaleDraft, cancelSaleDraft } from '../data/conversations';
import type { SaleItem } from './conversation';
/** RPCs return JSON objects; validate before exposing values to orchestration. */
export function createConversationRepositories(client: SupabaseClient) {
  return {
    async createDraft(verifiedSender: string, operationKey: string, items: SaleItem[]) {
      const value = z.object({ draft_id: z.string().uuid() }).parse(await createSaleDraft(client, { verifiedSender, operationKey, items }));
      return { draftId: value.draft_id };
    },
    async confirmDraft(verifiedSender: string, draftId: string) {
      const value = z.object({ total_cents: z.number().int().nonnegative().safe() }).parse(await confirmSaleDraft(client, { verifiedSender, draftId }));
      return { totalCents: value.total_cents };
    },
    async cancelDraft(verifiedSender: string, draftId: string) { await cancelSaleDraft(client, { verifiedSender, draftId }); },
  };
}
