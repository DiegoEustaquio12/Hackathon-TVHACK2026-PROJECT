import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createContinuations } from '../auth/continuations';
import { getBusinessDailyReport, recordExpense, setBusinessTimeZone, type DailyReport } from '../data/accounting';
import type { InboundMessage } from '../messaging/contracts';
const expense = z.object({ concept: z.string().trim().min(1).max(200), amount_cents: z.number().int().positive().max(2147483647) });
const pending = expense.extend({ operationKey: z.string().min(1).max(200), occurredAt: z.iso.datetime({ offset: true }) });
const money = (v: number) => `$${(v / 100).toFixed(2)} MXN`;
export interface AccountingDependencies {
  record(input: { verifiedSender: string; operationKey: string; concept: string; amountCents: number; occurredAt: string }): Promise<unknown>;
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
    propose(message: InboundMessage, input: unknown) {
      const data = expense.parse(input);
      const token = tokens.issue(message.from, 'expense', { ...data, operationKey: `expense:${message.providerMessageId}`, occurredAt: message.receivedAt });
      return `Gasto propuesto: ${data.concept}, ${money(data.amount_cents)}. No se ha guardado.\nResponde CONFIRMAR GASTO ${token}\nVence en 15 minutos. Para descartarlo no confirmes o escribe CANCELAR GASTO.`;
    },
    report,
    async command(message: InboundMessage): Promise<string | null> {
      const text = message.text?.trim() ?? '';
      if (/^CANCELAR GASTO$/i.test(text)) return 'No se registró ningún gasto con este mensaje. Descarta la propuesta anterior; su confirmación vence en 15 minutos.';
      const confirm = /^CONFIRMAR GASTO (\S+)$/i.exec(text);
      if (confirm) {
        let data: z.infer<typeof pending>;
        try { data = pending.parse(tokens.read(confirm[1], message.from, 'expense')); }
        catch { return 'La propuesta no es válida o venció. Escribe el gasto otra vez.'; }
        await deps.record({ verifiedSender: message.from, operationKey: data.operationKey, concept: data.concept, amountCents: data.amount_cents, occurredAt: data.occurredAt });
        return `Gasto registrado: ${data.concept}, ${money(data.amount_cents)}.`;
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
  return createAccounting({ record: input => recordExpense(client, input), report: sender => getBusinessDailyReport(client, sender),
    setTimeZone: (sender, zone) => setBusinessTimeZone(client, sender, zone) }, secret);
}
