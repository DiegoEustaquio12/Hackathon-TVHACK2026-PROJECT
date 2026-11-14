import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const command = z.object({
  verifiedSender: z.string().regex(/^[1-9][0-9]{7,14}$/),
  operationKey: z.string().trim().min(1).max(200),
  source: z.enum(['whatsapp', 'whatsapp_flow']).default('whatsapp'),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive().max(999999999.999),
  }).strict()).min(1).max(100),
}).strict();

/** Server only. The caller authenticates the provider webhook and binds the sender.
 * Pass a privileged server client; never import this repository from client UI.
 * SQL remains the authority for validation, pricing, stock and idempotency.
 */
export async function recordWhatsAppSale(client: SupabaseClient, input: z.input<typeof command>) {
  const parsed = command.parse(input);
  const { data, error } = await client.rpc('record_whatsapp_sale', {
    p_whatsapp_id: parsed.verifiedSender,
    p_idempotency_key: parsed.operationKey,
    p_items: parsed.items,
    p_source: parsed.source,
  });
  if (error) throw error;
  return data;
}
