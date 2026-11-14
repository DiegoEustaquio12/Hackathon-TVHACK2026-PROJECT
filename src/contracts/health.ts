import { z } from "zod";
import { timestampSchema } from "./common";

export const webApiPaths = [
  "/api/health",
  "/api/chat/messages",
  "/api/distributor/dashboard",
  "/api/distributor/orders",
  "/api/distributor/orders/[orderId]/status",
  "/api/distributor/orders/[orderId]",
  "/api/distributor/plans",
] as const;

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("knectan-web"),
  mockMode: z.boolean(),
  timestamp: timestampSchema,
  endpoints: z.array(z.string().startsWith("/api/")).min(1),
}).strict();

export type Health = z.infer<typeof healthSchema>;
