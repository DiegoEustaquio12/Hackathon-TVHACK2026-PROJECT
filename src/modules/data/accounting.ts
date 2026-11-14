import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const phone = z.string().regex(/^[1-9][0-9]{7,14}$/);
const timestamp = z.iso.datetime({ offset: true });
export const dailyReportSchema = z.object({
  day: z.iso.date(), time_zone: z.string(), starts_at: timestamp, ends_at: timestamp,
  sales_count: z.number().int().nonnegative().safe(), sales_total_cents: z.number().int().nonnegative().safe(),
  expenses_total_cents: z.number().int().nonnegative().safe(),
  sold_items: z.array(z.object({ product_id: z.string().uuid().nullable(), description: z.string(),
    quantity: z.number().positive(), subtotal_cents: z.number().int().nonnegative().safe() })),
});
export type DailyReport = z.infer<typeof dailyReportSchema>;
/** Call only after explicit expense confirmation; operationKey remains stable on retry. */
export async function recordExpense(client: SupabaseClient, input: {
  verifiedSender: string; operationKey: string; concept: string; amountCents: number; occurredAt?: string;
}) {
  const data = z.object({ verifiedSender: phone, operationKey: z.string().trim().min(1).max(200),
    concept: z.string().trim().min(1).max(200), amountCents: z.number().int().positive().max(2147483647),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
  }).strict().parse(input);
  const result = await client.rpc('record_whatsapp_expense', {
    p_sender: data.verifiedSender, p_operation_key: data.operationKey, p_concept: data.concept,
    p_amount: data.amountCents, p_occurred_at: data.occurredAt ?? null,
  });
  if (result.error) throw result.error;
  return z.object({ id: z.string().uuid(), business_id: z.string().uuid(), concept: z.string(),
    amount_cents: z.number().int().positive(), occurred_at: timestamp, created_at: timestamp,
  }).parse(result.data);
}

export async function setBusinessTimeZone(client: SupabaseClient, verifiedSender: string, timeZone: string) {
  const result = await client.rpc('set_business_time_zone', {
    p_sender: phone.parse(verifiedSender), p_time_zone: z.string().min(1).max(100).parse(timeZone),
  });
  if (result.error) throw result.error;
}

export async function getBusinessDailyReport(client: SupabaseClient, verifiedSender: string, day?: string) {
  const result = await client.rpc('get_business_daily_report', {
    p_sender: phone.parse(verifiedSender), p_day: day === undefined ? null : z.iso.date().parse(day),
  });
  if (result.error) throw result.error;
  return dailyReportSchema.parse(result.data);
}
