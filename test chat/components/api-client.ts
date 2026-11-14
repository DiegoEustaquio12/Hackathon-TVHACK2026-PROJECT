import type { z } from "zod";
import { errorSchema } from "@/src/contracts/common";

export async function api<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" }); }
  catch { throw new Error("No hay conexión con el servidor. Revisa tu conexión e intenta de nuevo."); }
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error("El servidor no devolvió una respuesta válida. Intenta de nuevo."); }
  if (!response.ok) {
    const error = errorSchema.safeParse(value);
    throw new Error(error.success ? error.data.message : "No pudimos completar la solicitud. Intenta de nuevo.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("Los datos recibidos no son válidos. Actualiza la página.");
  return parsed.data;
}
export const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Ocurrió un error. Intenta de nuevo.";
