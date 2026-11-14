import { createOrderSchema } from "@/src/contracts/distributor";

export const currency = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);

/** Decimal string arithmetic avoids floating-point rounding (for example 1.005). */
export function mxnToCents(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return createOrderSchema.shape.total_cents.safeParse(cents).success ? cents : null;
}
