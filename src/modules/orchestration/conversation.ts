import type { InterpretationResult } from '../interpretation/types';
import type { createAccounting } from './accounting';
import type { createChoices, SelectionContext } from './choices';
import { z } from 'zod';
import { draftSchema, type ConfirmationResult, formatPriceChangeNotice, quoteSchema } from '../data/sale-results';
import type { InboundMessage, WhatsAppActor } from '../messaging/contracts';
import type { AudioReference } from '../media/audio';
import type { AudioPreparation } from '../interpretation/audio';
export type SaleItem = { product_id: string; quantity: number };
export interface ConversationDependencies {
  resolveActor(sender: string): Promise<WhatsAppActor | null>;
  interpret(actor: WhatsAppActor, request: { text: string }): Promise<InterpretationResult>;
  prepareAudio?(actor: WhatsAppActor, reference: AudioReference): Promise<AudioPreparation>;
  interpretSelection?(actor: WhatsAppActor, text: string, selections: Record<string,string>): Promise<InterpretationResult>;
  accounting?: ReturnType<typeof createAccounting>;
  choices?: ReturnType<typeof createChoices>;
  onboard?(message: InboundMessage): Promise<string>;
  createDraft(sender: string, operationKey: string, items: SaleItem[]): Promise<z.infer<typeof draftSchema>>;
  confirmDraft(sender: string, draftId: string, quoteVersion: number): Promise<ConfirmationResult>;
  cancelDraft(sender: string, draftId: string): Promise<void>;
}
const itemsSchema = z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().positive().max(999999999.999)
  .refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001) }).strict()).min(1).max(100);
const money = (cents: number) => `$${(cents / 100).toFixed(2)} MXN`;
function summary(quote: z.infer<typeof quoteSchema>) {
  return [...quote.items.map(i => `${i.quantity} × ${i.description}: ${money(i.subtotal_cents)}`), `Total: ${money(quote.total_cents)}`].join('\n');
}
const instructions = (id: string, version: number) => `Responde CONFIRMAR ${id} ${version} o CANCELAR ${id}.`;
export function createConversation(deps: ConversationDependencies) {
  return async (message: InboundMessage): Promise<string> => {
    const actor = await deps.resolveActor(message.from);
    if (!actor) return deps.onboard ? deps.onboard(message) : 'Vincula tu número con tu negocio mediante un enlace seguro antes de registrar operaciones.';
    if (actor.verifiedSender !== message.from || actor.channel !== 'whatsapp') throw new Error('Identity mismatch');
    const fromAudio = message.kind === 'audio';
    let notice = '';
    if (fromAudio) {
      if (!deps.prepareAudio || !message.audio) return 'El audio todavía no está disponible en este canal. Escribe los productos y cantidades.';
      const prepared = await deps.prepareAudio(actor, message.audio);
      if ('clarification' in prepared) return prepared.clarification;
      // Never re-enter command processing with a transcript, including spoken approvals.
      message = { ...message, text: prepared.text };
      notice = `Transcripción: «${prepared.text}»\n`;
    } else if (message.kind !== 'text') return 'Por ahora puedo registrar ventas por texto. Escribe los productos y cantidades.';
    const text = message.text!.trim();
    const accountingReply = !fromAudio ? await deps.accounting?.command(message) : null;
    if (accountingReply) return accountingReply;
    const action = /^(confirmar|cancelar)\s+([a-f0-9-]{36})(?:\s+([1-9][0-9]{0,8}))?$/i.exec(text);
    if (!fromAudio && action && z.string().uuid().safeParse(action[2]).success) {
      if (action[1].toLowerCase() === 'cancelar') { await deps.cancelDraft(message.from, action[2]); return 'Borrador cancelado.'; }
      if (!action[3]) return 'Incluye la versión que aparece en el resumen: CONFIRMAR <id> <versión>.';
      const result = await deps.confirmDraft(message.from, action[2], Number(action[3]));
      if (result.status === 'confirmed') return `Venta registrada: ${money(result.receipt.total_cents)}.`;
      if (!result.quote) return 'El resumen ya no está disponible. Solicita un nuevo borrador.';
      return [result.status === 'price_changed' ? formatPriceChangeNotice(result) : 'Esa confirmación pertenece a un resumen anterior. Revisa y confirma el vigente.', summary(result.quote), instructions(result.draft_id, result.quote_version)].join('\n');
    }
    if (/^(sí|si|confirmar|cancelar)$/i.test(text)) return 'Incluye por texto el identificador del resumen: CONFIRMAR <id> <versión> o CANCELAR <id>.';
    if (/^(hola|buenos días|buenas tardes)[!. ]*$/i.test(text)) return 'Hola. Escribe tu venta con productos y cantidades; te mostraré un resumen antes de registrarla.';
    let result: InterpretationResult;
    let operationKey = `infobip:${message.providerMessageId}`;
    let selectionContext: SelectionContext | undefined;
    if (!fromAudio && /^ELEGIR\b/i.test(text)) {
      let selection;
      try { selection = deps.choices?.read(message); }
      catch { return 'La selección venció o no es válida. Escribe la venta completa otra vez.'; }
      if (!selection || !deps.interpretSelection) return 'Escribe la venta completa con la presentación de cada producto.';
      result = await deps.interpretSelection(actor, selection.originalText, selection.selections);
      operationKey = selection.operationKey;
      selectionContext = selection;
    } else result = await deps.interpret(actor, { text });
    if (result.clarificationOptions?.length && deps.choices) return notice + deps.choices.prompt(message, result, selectionContext);
    if (result.clarification) return notice + result.clarification;
    if (result.intent === 'expense' && result.data.expense && deps.accounting) return notice + await deps.accounting.propose(message, result.data.expense);
    if (result.intent === 'report' && result.data.report === 'sales_today' && deps.accounting) return notice + await deps.accounting.report(message.from);
    if (result.intent !== 'sale' || result.confidence < 0.8 || !Number.isFinite(result.confidence) || result.confidence > 1) return 'Necesito los productos y cantidades de la venta. Todavía no registré ninguna operación.';
    const items = itemsSchema.parse(result.data.items);
    if (new Set(items.map(i => i.product_id)).size !== items.length) return 'Aclara las cantidades por producto antes de continuar.';
    const draft = await deps.createDraft(message.from, operationKey, items);
    if (draft.status !== 'pending' || !draft.quote) return 'Este borrador ya fue procesado. Consulta el recibo o inicia una nueva venta.';
    return `${notice}${summary(draft.quote)}\nNo se ha registrado la venta. ${instructions(draft.draft_id, draft.quote_version)} Vence: ${draft.expires_at}.`;
  };
}
