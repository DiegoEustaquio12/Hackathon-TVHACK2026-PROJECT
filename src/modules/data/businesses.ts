import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Business, CatalogueProduct, InterpretationRequest } from '../interpretation/types';
import { interpretSaleMessage } from '../interpretation/parser';

const phone = z.string().regex(/^[1-9][0-9]{7,14}$/);
const businessSchema = z.object({
  id: z.string().uuid(), name: z.string(), whatsapp_id: phone,
  business_type: z.string().nullable(), onboarding_completed_at: z.string().nullable(),
  time_zone: z.string().nullable().optional(),
});

/** Server only. Sender comes from an authenticated provider event, never message text. */
export async function findBusinessByWhatsApp(client: SupabaseClient, verifiedSender: string): Promise<Business | null> {
  const { data, error } = await client.from('businesses')
    .select('id,name,whatsapp_id,business_type,onboarding_completed_at,time_zone')
    .eq('whatsapp_id', phone.parse(verifiedSender)).maybeSingle();
  if (error) throw error;
  return data ? businessSchema.parse(data) : null;
}

export async function completeBusinessOnboarding(client: SupabaseClient, input: {
  verifiedSender: string; name: string; businessType: string;
}) {
  const parsed = z.object({ verifiedSender: phone,
    name: z.string().trim().min(1).max(160), businessType: z.string().trim().min(1).max(160),
  }).strict().parse(input);
  const { data, error } = await client.rpc('complete_business_onboarding', {
    p_sender: parsed.verifiedSender, p_name: parsed.name, p_business_type: parsed.businessType,
  });
  if (error) throw error;
  return businessSchema.omit({ onboarding_completed_at: true }).parse(data);
}

export async function getBusinessCatalogue(client: SupabaseClient, verifiedSender: string): Promise<{
  business: Business; products: CatalogueProduct[];
}> {
  const business = await findBusinessByWhatsApp(client, verifiedSender);
  if (!business?.onboarding_completed_at || !business.business_type) throw new Error('ONBOARDING_REQUIRED');
  // Fetch all catalogue pages: never omit products silently after the API's row limit.
  const products: CatalogueProduct[] = [];
  const schema = z.array(z.object({ id: z.string().uuid(), name: z.string(),
    sale_price_cents: z.number().int().nonnegative(), stock: z.coerce.number().nonnegative(),
    unit_cost_cents: z.number().int().nonnegative().nullable(),
    aliases: z.array(z.string()), product_type: z.string().nullable(), brand: z.string().nullable(),
    variant: z.string().nullable(), presentation: z.string().nullable(),
    content_amount: z.coerce.number().nullable(), content_unit: z.enum(['ml','g','piece']).nullable(),
    sale_unit: z.enum(['piece','kg','g','l','ml']).nullable(),
  }));
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('products').select('id,name,sale_price_cents,unit_cost_cents,stock,aliases,product_type,brand,variant,presentation,content_amount,content_unit,sale_unit')
      .eq('business_id', business.id).order('id').range(offset, offset + 499);
    if (error) throw error;
    const page = schema.parse(data);
    products.push(...page);
    if (page.length < 500) break;
  }
  return { business, products };
}

export async function interpretForWhatsApp(client: SupabaseClient, verifiedSender: string, request: InterpretationRequest) {
  const { business, products } = await getBusinessCatalogue(client, verifiedSender);
  return { business, interpretation: interpretSaleMessage(request, products) };
}
