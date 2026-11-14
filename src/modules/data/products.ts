import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const productSpecificationSchema = z.object({
  product_type: z.string().trim().min(1).max(50),
  brand: z.string().trim().max(40).optional(), variant: z.string().trim().max(40).optional(),
  presentation: z.string().trim().min(1).max(30),
  content_amount: z.number().positive().max(999999999.999).multipleOf(0.001),
  content_unit: z.enum(['ml','l','g','kg','piece']), sale_unit: z.enum(['piece','kg','g','l','ml']),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
}).strict();
export type ProductSpecification = z.input<typeof productSpecificationSchema>;
export const standardProductSchema = z.object({
  id: z.string().uuid(), business_id: z.string().uuid(), name: z.string(),
  sale_price_cents: z.number().int().nonnegative(), unit_cost_cents: z.number().int().nonnegative().nullable(),
  stock: z.coerce.number().nonnegative(), product_type: z.string(), brand: z.string().nullable(),
  variant: z.string().nullable(), presentation: z.string(), content_amount: z.coerce.number().positive(),
  content_unit: z.enum(['ml','g','piece']), sale_unit: z.enum(['piece','kg','g','l','ml']), aliases: z.array(z.string()),
});
const values = {
  verifiedSender: z.string().regex(/^[1-9][0-9]{7,14}$/),
  priceCents: z.number().int().min(0).max(2147483647),
  stock: z.number().min(0).max(999999999.999).multipleOf(0.001),
  costCents: z.number().int().min(0).max(2147483647).nullable().default(null),
};

/** Server only; product identity is computed by SQL, never chosen by AI or browser. */
export async function createStandardProduct(client: SupabaseClient, input: {
  verifiedSender: string; operationKey: string; specification: ProductSpecification;
  priceCents: number; stock: number; costCents?: number | null;
}) {
  const data = z.object({ ...values, operationKey: z.string().trim().min(1).max(200),
    specification: productSpecificationSchema }).strict().parse(input);
  const result = await client.rpc('create_standard_product', {
    p_sender: data.verifiedSender, p_operation_key: data.operationKey, p_spec: data.specification,
    p_price: data.priceCents, p_stock: data.stock, p_cost: data.costCents,
  });
  if (result.error) throw result.error;
  return standardProductSchema.parse(result.data);
}

/** Catalogue panel only. Replacing stock is an explicit stock count, not a purchase. */
export async function updateProductCommercials(client: SupabaseClient, input: {
  verifiedSender: string; productId: string; priceCents: number; stock: number; costCents?: number | null;
  expected: { priceCents: number; stock: number; costCents: number | null };
}) {
  const data = z.object({ ...values, productId: z.string().uuid(), expected: z.object({
    priceCents: values.priceCents, stock: values.stock, costCents: values.costCents,
  }).strict() }).strict().parse(input);
  const result = await client.rpc('update_product_commercials', {
    p_sender: data.verifiedSender, p_product_id: data.productId, p_price: data.priceCents,
    p_stock: data.stock, p_cost: data.costCents,
    p_expected: { price_cents: data.expected.priceCents, stock: data.expected.stock, cost_cents: data.expected.costCents },
  });
  if (result.error) throw result.error;
  // Legacy products have no technical specification; preserve their readable shape.
  return standardProductSchema.extend({ product_type: z.string().nullable(), presentation: z.string().nullable(),
    content_amount: z.coerce.number().positive().nullable(), content_unit: z.enum(['ml','g','piece']).nullable(),
    sale_unit: z.enum(['piece','kg','g','l','ml']).nullable(),
  }).parse(result.data);
}
