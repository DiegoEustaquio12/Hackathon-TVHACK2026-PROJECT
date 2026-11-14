import { interpretSaleMessage } from '../interpretation/parser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSaleDraft, confirmSaleDraft, cancelSaleDraft } from '../data/conversations';
import { findBusinessByWhatsApp, interpretForWhatsApp, getBusinessCatalogue } from '../data/businesses';
import type { SaleItem } from './conversation';
export function createConversationRepositories(client: SupabaseClient) {
  return {
    async resolveActor(verifiedSender: string) {
      const business = await findBusinessByWhatsApp(client, verifiedSender);
      return business?.onboarding_completed_at && business.business_type
        ? { businessId: business.id, verifiedSender, channel: 'whatsapp' as const } : null;
    },
    async interpret(actor: { businessId: string; verifiedSender: string }, request: { text: string }) {
      const result = await interpretForWhatsApp(client, actor.verifiedSender, request);
      if (result.business.id !== actor.businessId) throw new Error('Identity changed');
      return result.interpretation;
    },
    async interpretSelection(actor: { businessId: string; verifiedSender: string }, text: string, productId: string) {
      const { business, products } = await getBusinessCatalogue(client, actor.verifiedSender);
      if (business.id !== actor.businessId) throw new Error('Identity changed');
      const original = interpretSaleMessage({ text }, products);
      const options = original.clarificationOptions;
      if (!options?.some(p => p.product_id === productId)) return { intent: 'unknown' as const, confidence: 0, data: {}, needsConfirmation: false, clarification: 'El catálogo cambió. Escribe de nuevo la venta con sus presentaciones.' };
      return interpretSaleMessage({ text }, products.filter(p => p.id === productId || !options.some(o => o.product_id === p.id)));
    },
    createDraft(verifiedSender: string, operationKey: string, items: SaleItem[]) {
      return createSaleDraft(client, { verifiedSender, operationKey, items });
    },
    confirmDraft(verifiedSender: string, draftId: string, quoteVersion: number) {
      return confirmSaleDraft(client, { verifiedSender, draftId, quoteVersion });
    },
    async cancelDraft(verifiedSender: string, draftId: string) { await cancelSaleDraft(client, { verifiedSender, draftId }); },
  };
}
