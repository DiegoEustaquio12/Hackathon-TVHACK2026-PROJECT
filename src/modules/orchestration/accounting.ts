import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import { getBusinessDailyReport, setBusinessTimeZone, type DailyReport } from '../data/accounting';
import { createExpenseDraftRepository } from '../data/expense-drafts';
import type { InboundMessage } from '../messaging/contracts';
const expense = z.object({ concept: z.string().trim().min(1).max(200), amount_cents: z.number().int().positive().max(2147483647) });
const pending = z.object({ draftId: z.string().uuid() });
const money = (v: number) => `$${(v / 100).toFixed(2)} MXN`;
export interface AccountingDependencies {
  drafts: ReturnType<typeof createExpenseDraftRepository>;
  report(sender: string): Promise<DailyReport>;
  setTimeZone(sender: string, zone: string): Promise<void>;
}
export function createAccounting(deps: AccountingDependencies, secret: string, now = Date.now) {
  const tokens = createContinuations(secret, now);
  const report = async (sender: string) => {
    try {
      const result = await deps.report(sender);
      return [`Reporte del ${result.day} (${result.time_zone})`, `Ventas: ${money(result.sales_total_cents)} (${result.sales_count})`,
        `Gastos: ${money(result.expenses_total_cents)}`, ...result.sold_items.map(i => `${i.quantity} × ${i.description}: ${money(i.subtotal_cents)}`)].join('\n');
    } catch (error) {
      if ((error as { message?: string }).message?.includes('TIME_ZONE_REQUIRED')) return 'Necesito la zona horaria de tu negocio. Escribe ZONA America/Mexico_City si corresponde a tu ubicación, o el nombre IANA de tu zona.';
      throw error;
    }
  };
  return {
    async propose(message: InboundMessage, input: unknown) {
      const data = expense.parse(input);
      const draft = await deps.drafts.propose({ verifiedSender:message.from,operationKey:`expense:${message.providerMessageId}`,
        concept:data.concept,amountCents:data.amount_cents,occurredAt:message.receivedAt });
      if (draft.status !== 'pending') return 'La propuesta de gasto ya fue procesada. Escribe un gasto nuevo si corresponde.';
      const token = tokens.issue(message.from, 'expense', { draftId:draft.draft_id });
      return `Gasto propuesto: ${data.concept}, ${money(data.amount_cents)}. No se ha guardado.\nResponde CONFIRMAR GASTO ${token}\nVence en 15 minutos. Para cancelar esta propuesta responde CANCELAR GASTO ${token}. CANCELAR GASTO sin token cancela todas tus propuestas pendientes.`;
    },
    report,
    async command(message: InboundMessage): Promise<string | null> {
      const text = message.text?.trim() ?? '';
      const cancel = /^CANCELAR GASTO(?: (\S+))?$/i.exec(text);
      if (cancel) {
        let draftId: string | undefined;
        if (cancel[1]) {
          try { draftId = pending.parse(tokens.read(cancel[1],message.from,'expense')).draftId; }
          catch { return 'La propuesta no es válida o venció.'; }
        }
        const n = await deps.drafts.cancel(message.from,draftId);
        return n ? `Se cancelaron ${n} propuestas de gasto. Sus confirmaciones ya no son válidas.` : 'No hay propuestas de gasto pendientes para cancelar.';
      }
      const confirm = /^CONFIRMAR GASTO (\S+)$/i.exec(text);
      if (confirm) {
        let data: z.infer<typeof pending>;
        try { data = pending.parse(tokens.read(confirm[1], message.from, 'expense')); }
        catch { return 'La propuesta no es válida o venció. Escribe el gasto otra vez.'; }
        const receipt = await deps.drafts.confirm(message.from,data.draftId);
        return `Gasto registrado: ${receipt.concept}, ${money(receipt.amount_cents)}.`;
      }
      const zone = /^ZONA\s+(\S+)$/i.exec(text);
      if (zone) {
        try { new Intl.DateTimeFormat('es-MX', { timeZone: zone[1] }).format(); }
        catch { return 'Zona horaria no válida. Indica un nombre IANA, por ejemplo America/Mexico_City, que corresponda a tu negocio.'; }
        await deps.setTimeZone(message.from, zone[1]);
        return report(message.from);
      }
      return null;
    },
  };
}
export function createSupabaseAccounting(client: SupabaseClient, secret: string) {
  return createAccounting({ drafts: createExpenseDraftRepository(client), report: sender => getBusinessDailyReport(client, sender),
    setTimeZone: (sender, zone) => setBusinessTimeZone(client, sender, zone) }, secret);
}
