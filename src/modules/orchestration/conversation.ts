import { z } from 'zod';
import type { InboundMessage, WhatsAppActor } from '../messaging/contracts';
export type SaleItem = { product_id: string; quantity: number };
export interface ConversationDependencies {
  resolveActor(sender: string): Promise<WhatsAppActor | null>;
  interpret(actor: WhatsAppActor, request: { text: string }): Promise<{
    intent: 'sale' | 'report' | 'expense' | 'unknown'; confidence: number;
    data: { items?: SaleItem[] }; needsConfirmation: boolean; clarification?: string;
  }>;
  createDraft(sender: string, operationKey: string, items: SaleItem[]): Promise<{ draftId: string }>;
  confirmDraft(sender: string, draftId: string): Promise<{ totalCents: number }>;
  cancelDraft(sender: string, draftId: string): Promise<void>;
  /** Server-side catalogue summary. Must use the same catalogue as confirmation. */
  summarize(actor: WhatsAppActor, items: SaleItem[]): Promise<string>;
}
const itemsSchema = z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().positive().max(999999999.999)
  .refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001) }).strict()).min(1).max(100);
export function createConversation(deps: ConversationDependencies) {
  return async (message: InboundMessage): Promise<string> => {
    const actor = await deps.resolveActor(message.from);
    if (!actor) return 'Vincula tu número con tu negocio mediante un enlace seguro antes de registrar operaciones.';
    if (actor.verifiedSender !== message.from || actor.channel !== 'whatsapp') throw new Error('Identity mismatch');
    if (message.kind !== 'text') return 'Por ahora puedo registrar ventas por texto. Escribe los productos y cantidades.';
    const text = message.text!.trim();
    const action = /^(confirmar|cancelar)\s+([a-f0-9-]{36})$/i.exec(text);
    if (action && z.string().uuid().safeParse(action[2]).success) {
      if (action[1].toLowerCase() === 'cancelar') { await deps.cancelDraft(message.from, action[2]); return 'Borrador cancelado.'; }
      const sale = await deps.confirmDraft(message.from, action[2]);
      return `Venta registrada: $${(sale.totalCents / 100).toFixed(2)} MXN.`;
    }
    if (/^(sí|si|confirmar|cancelar)$/i.test(text)) return 'Incluye el identificador del resumen: CONFIRMAR <id> o CANCELAR <id>.';
    if (/^(hola|buenos días|buenas tardes)[!. ]*$/i.test(text)) return 'Hola. Escribe tu venta con productos y cantidades; te mostraré un resumen antes de registrarla.';
    const result = await deps.interpret(actor, { text });
    if (result.clarification) return result.clarification;
    if (result.intent !== 'sale' || result.confidence < 0.8 || !Number.isFinite(result.confidence) || result.confidence > 1) return 'Necesito los productos y cantidades de la venta. Todavía no registré ninguna operación.';
    const items = itemsSchema.parse(result.data.items);
    if (new Set(items.map(i => i.product_id)).size !== items.length) return 'Aclara las cantidades por producto antes de continuar.';
    const summary = await deps.summarize(actor, items);
    const draft = await deps.createDraft(message.from, `infobip:${message.providerMessageId}`, items);
    return `${summary}\nNo se ha registrado la venta. Responde CONFIRMAR ${draft.draftId} o CANCELAR ${draft.draftId}. El borrador vence en 15 minutos.`;
  };
}
