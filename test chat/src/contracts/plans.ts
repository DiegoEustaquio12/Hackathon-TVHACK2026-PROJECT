import { z } from "zod";
import { centsSchema, timestampSchema } from "./common";

export const planIdSchema = z.enum(["initial", "featured", "total"]);
export const supplierPlanSchema = z.object({
  id: planIdSchema, name: z.string().min(1), monthly_price_cents: centsSchema,
  reach: z.string(), positioning: z.string(), analytics: z.string(), benefits: z.array(z.string()).min(1),
}).strict();
export const activatePlanSchema = z.object({ planId: planIdSchema }).strict();
export const planActivationSchema = z.object({
  planId: planIdSchema, status: z.literal("mock_active"), activated_at: timestampSchema,
  monthly_price_cents: centsSchema,
}).strict();
export type SupplierPlan = z.infer<typeof supplierPlanSchema>;
export type ActivatePlanInput = z.infer<typeof activatePlanSchema>;
export type PlanActivation = z.infer<typeof planActivationSchema>;

/** Illustrative demo pricing and benefits; no real ad delivery or billing. */
export const supplierPlans = z.array(supplierPlanSchema).length(3).parse([
  { id: "initial", name: "Impulso Inicial", monthly_price_cents: 29900,
    reach: "Comercios de tu zona", positioning: "Presencia en recomendaciones locales relevantes",
    analytics: "Resumen mensual de visualizaciones", benefits: ["Perfil de proveedor", "Catálogo de hasta 50 productos"] },
  { id: "featured", name: "Proveedor Destacado", monthly_price_cents: 79900,
    reach: "Comercios de tu ciudad", positioning: "Espacio patrocinado destacado en consultas relacionadas",
    analytics: "Consultas y clics por producto cada semana", benefits: ["Catálogo de hasta 250 productos", "Campañas por categoría"] },
  { id: "total", name: "Cobertura Total", monthly_price_cents: 149900,
    reach: "Comercios de varias ciudades", positioning: "Espacios patrocinados en varias zonas de cobertura",
    analytics: "Desglose diario por zona, producto y campaña", benefits: ["Catálogo sin límite de productos", "Acompañamiento de campañas"] },
]);

export function recommendPlan(catalogueSize: number, monthlyOrders: number): SupplierPlan["id"] {
  if (catalogueSize > 250 || monthlyOrders > 500) return "total";
  return catalogueSize > 50 || monthlyOrders > 100 ? "featured" : "initial";
}
