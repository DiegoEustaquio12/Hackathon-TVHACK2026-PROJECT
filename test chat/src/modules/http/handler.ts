import type { z } from "zod";
import type { Actor } from "../../contracts/common";
import { MAX_REQUEST_BYTES } from "../../contracts/chat";
import { getServices, getSessionVerifier, prepareResponseCookie } from "./container";
import { errorResponse, HttpError } from "./errors";
import { resolveSession } from "./session";
import type { HttpServices } from "../../contracts/services";

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", "Revisa los campos enviados: faltan datos, hay campos no permitidos o un formato no válido.");
  return result.data;
}
export function queryInput(request: Request): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key)) throw new HttpError(400, "VALIDATION_ERROR", "No repitas parámetros de consulta.");
    result[key] = value;
  }
  return result;
}
export async function readJson(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next can use an internal hostname in request.url. The incoming Host names
  // the public destination; do not trust arbitrary x-forwarded-host headers.
  const expectedOrigin = request.headers.get("host")
    ? new URL(`${requestUrl.protocol}//${request.headers.get("host")}`).origin : requestUrl.origin;
  if (origin && origin !== expectedOrigin) throw new HttpError(403, "FORBIDDEN_ORIGIN", "El origen de la solicitud no está permitido.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Envía la solicitud como JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_JSON", "La solicitud debe contener JSON válido.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new HttpError(413, "PAYLOAD_TOO_LARGE", "La solicitud supera 3 MB. Usa un archivo de hasta 2 MB."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "INVALID_JSON", "La solicitud debe contener JSON válido."); }
}
export async function handle<T>(request: Request, schema: z.ZodType<T>, action: (actor: Actor, services: HttpServices) => Promise<T>, status = 200) {
  let cookie: string | undefined;
  try {
    const session = await resolveSession(request, getSessionVerifier()); cookie = session.cookie;
    const prepareCookie = prepareResponseCookie(request, session.actor);
    const result = schema.safeParse(await action(session.actor, getServices()));
    if (!result.success) throw new HttpError(500, "INVALID_RESPONSE", "El servicio devolvió una respuesta no válida.");
    const response = Response.json(result.data, { status, headers: { "Cache-Control": "no-store" } });
    if (cookie) response.headers.append("Set-Cookie", cookie);
    if (prepareCookie) response.headers.append("Set-Cookie", prepareCookie());
    return response;
  } catch (error) {
    const response = errorResponse(error);
    if (cookie) response.headers.set("Set-Cookie", cookie);
    return response;
  }
}
