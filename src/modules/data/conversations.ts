import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const phone = z.string().regex(/^[1-9][0-9]{7,14}$/);
const key = z.string().min(1).max(200);
const items = z.array(z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive().max(999999999.999),
}).strict()).min(1).max(100);

// Server-only repositories. Use a privileged client after authenticating the webhook.
// Provider-specific payload parsing and phone normalization belong to role 2.
export async function registerInboundEvent(client: SupabaseClient, input: {
  provider: string; providerMessageId: string; verifiedSender: string; recipient: string;
}) {
  const data = z.object({
    provider: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    providerMessageId: key, verifiedSender: phone, recipient: phone,
  }).strict().parse(input);
  const result = await client.rpc('register_whatsapp_event', {
    p_provider: data.provider, p_message_id: data.providerMessageId,
    p_sender: data.verifiedSender, p_recipient: data.recipient,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function createSaleDraft(client: SupabaseClient, input: {
  verifiedSender: string; operationKey: string;
  items: { product_id: string; quantity: number }[];
}) {
  const data = z.object({ verifiedSender: phone, operationKey: key, items }).strict().parse(input);
  const result = await client.rpc('create_whatsapp_sale_draft', {
    p_sender: data.verifiedSender, p_operation_key: data.operationKey, p_items: data.items,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function confirmSaleDraft(client: SupabaseClient, input: {
  verifiedSender: string; draftId: string;
}) {
  const data = z.object({ verifiedSender: phone, draftId: z.string().uuid() }).strict().parse(input);
  const result = await client.rpc('confirm_whatsapp_sale_draft', {
    p_sender: data.verifiedSender, p_draft_id: data.draftId,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function cancelSaleDraft(client: SupabaseClient, input: {
  verifiedSender: string; draftId: string;
}) {
  const data = z.object({ verifiedSender: phone, draftId: z.string().uuid() }).strict().parse(input);
  const result = await client.rpc('cancel_whatsapp_sale_draft', {
    p_sender: data.verifiedSender, p_draft_id: data.draftId,
  });
  if (result.error) throw result.error;
  return result.data;
}
