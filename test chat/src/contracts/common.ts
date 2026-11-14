import { z } from "zod";

export const timestampSchema = z.string().datetime({ offset: false, precision: 3 });
export const centsSchema = z.number().int().nonnegative().safe();
export const errorSchema = z.object({ code: z.string(), message: z.string() }).strict();
export const emptyQuerySchema = z.object({}).strict();
export const actorSchema = z.object({
  businessId: z.string().min(1),
  userId: z.string().min(1),
  channel: z.literal("web"),
  sessionId: z.string().uuid(),
}).strict();
export type Actor = z.infer<typeof actorSchema>;
export type ApiError = z.infer<typeof errorSchema>;
