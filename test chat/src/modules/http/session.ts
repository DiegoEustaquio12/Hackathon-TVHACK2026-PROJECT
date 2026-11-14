import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { actorSchema, type Actor } from "../../contracts/common";
import type { SessionVerifier } from "../../contracts/services";
import { HttpError } from "./errors";

export const MOCK_COOKIE = "knectan_demo";
export const isMockMode = () => process.env.MOCK_MODE === "true";
const maxAge = 6 * 60 * 60;
const sign = (payload: string) => createHmac("sha256", process.env.MOCK_SESSION_SECRET || "knectan-public-demo-only-v1").update(payload).digest("base64url");

export async function resolveSession(request: Request, verifier?: SessionVerifier): Promise<{ actor: Actor; cookie?: string }> {
  if (!isMockMode()) {
    const actor = await verifier?.verify(request);
    if (!actor) throw new HttpError(401, "UNAUTHORIZED", "Inicia sesión para continuar.");
    return { actor: actorSchema.parse(actor) };
  }
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${MOCK_COOKIE}=`))?.slice(MOCK_COOKIE.length + 1);
  if (token !== undefined) {
    try {
      const [payload, signature, extra] = token.split(".");
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature || "");
      if (extra !== undefined || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
      const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (!Number.isSafeInteger(value.expires) || value.expires <= Date.now()) throw new Error();
      const actor = actorSchema.parse(value.actor);
      if (actor.businessId !== "demo-business" || actor.userId !== "demo-user" || actor.channel !== "web") throw new Error();
      return { actor };
    } catch { throw new HttpError(401, "UNAUTHORIZED", "La sesión de demostración venció o no es válida. Borra la cookie de la demo y recarga."); }
  }
  const actor: Actor = { businessId: "demo-business", userId: "demo-user", channel: "web", sessionId: randomUUID() };
  const payload = Buffer.from(JSON.stringify({ actor, expires: Date.now() + maxAge * 1000 })).toString("base64url");
  return { actor, cookie: `${MOCK_COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` };
}
