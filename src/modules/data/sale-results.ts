import { z } from 'zod';

const line = z.object({
  product_id: z.string().uuid(), description: z.string(), quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(), subtotal_cents: z.number().int().nonnegative(),
});
export const quoteSchema = z.object({ items: z.array(line), total_cents: z.number().int().nonnegative() });
export const draftSchema = z.object({
  draft_id: z.string().uuid(), status: z.enum(['pending', 'confirmed', 'cancelled']),
  expires_at: z.string(), quote_version: z.number().int().positive(), quote: quoteSchema.nullable(),
});
const receiptSchema = z.object({
  sale_id: z.string().uuid(), total_cents: z.number().int().nonnegative(), replayed: z.boolean(),
  items: z.array(line),
});
const quoteReply = { draft_id: z.string().uuid(), quote_version: z.number().int().positive(), quote: quoteSchema };
export const confirmationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('confirmed'), receipt: receiptSchema }),
  z.object({ status: z.literal('price_changed'), ...quoteReply, previous_quote: quoteSchema.nullable() }),
  z.object({ status: z.literal('quote_outdated'), ...quoteReply, quote: quoteSchema.nullable() }),
]);
export type ConfirmationResult = z.infer<typeof confirmationSchema>;

/** R2 may use this text and attach buttons carrying draft_id + quote_version. */
export function formatPriceChangeNotice(result: Extract<ConfirmationResult, { status: 'price_changed' }>): string {
  const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
  const old = result.previous_quote;
  const changes = result.quote.items.flatMap(item => {
    const before = old?.items.find(previous => previous.product_id === item.product_id);
    return before && before.unit_price_cents !== item.unit_price_cents
      ? [`${item.description}: ${money(before.unit_price_cents)} → ${money(item.unit_price_cents)} por unidad.`] : [];
  });
  return ['El catálogo cambió. La venta todavía no se ha registrado.', ...changes,
    old ? `Total anterior: ${money(old.total_cents)}.` : 'El resumen anterior ya no está disponible.',
    `Nuevo total: ${money(result.quote.total_cents)}.`,
    'Revisa el nuevo resumen y confirma otra vez para registrar la venta.'].join('\n');
}
