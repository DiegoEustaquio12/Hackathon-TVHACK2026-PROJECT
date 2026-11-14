import { z } from "zod";
import { centsSchema, timestampSchema } from "./common";

export const orderStatusSchema = z.enum(["pending", "confirmed", "dispatched", "delivered", "cancelled"]);
export const statusLabels: Record<OrderStatus, string> = {
  pending: "Pendiente", confirmed: "Confirmado", dispatched: "En camino", delivered: "Entregado", cancelled: "Cancelado",
};
export const dashboardQuerySchema = z.object({ status: orderStatusSchema.optional(), q: z.string().trim().max(80).optional() }).strict();
export const orderParamsSchema = z.object({ orderId: z.string().regex(/^PED-\d{4}$/) }).strict();
export const updateOrderSchema = z.object({ status: orderStatusSchema, expected_version: z.number().int().positive() }).strict();
export const orderSchema = z.object({
  id: orderParamsSchema.shape.orderId, customer: z.string(), items_count: z.number().int().positive(),
  total_cents: centsSchema, status: orderStatusSchema, created_at: timestampSchema, updated_at: timestampSchema,
  version: z.number().int().positive(), allowed_statuses: z.array(orderStatusSchema),
}).strict();
export const dashboardSchema = z.object({
  business_name: z.string(), updated_at: timestampSchema,
  kpis: z.object({ orders_count: z.number().int().nonnegative(), pending_count: z.number().int().nonnegative(),
    active_count: z.number().int().nonnegative(), total_value_cents: centsSchema }).strict(),
  orders: z.array(orderSchema),
}).strict();
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
