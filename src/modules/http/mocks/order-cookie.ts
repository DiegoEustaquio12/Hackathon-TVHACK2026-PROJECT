import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { orderSchema, type Actor } from "../../../contracts";
import type { MockServices } from "./services";
import { HttpError } from "../errors";

const name = "microai_demo_orders";
const snapshotSchema = z.object({ sessionId: z.string().uuid(), expires: z.number().int(), orders: z.array(orderSchema).length(6) }).strict();
const sign = (payload: string) => createHmac("sha256", process.env.MOCK_SESSION_SECRET || "microai-public-demo-only-v1").update(`orders:${payload}`).digest("base64url");

/** A small signed demo snapshot lets separate serverless route instances share order changes. */
export function orderCookieScope(request: Request, actor: Actor, services: MockServices): () => string {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
  if (token) {
    try {
      if (token.length > 3800) throw new Error();
      const [payload, signature, extra] = token.split(".");
      const expected = Buffer.from(sign(payload)); const actual = Buffer.from(signature || "");
      if (extra !== undefined || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
      const snapshot = snapshotSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
      if (snapshot.sessionId === actor.sessionId && snapshot.expires > Date.now()) services.restoreOrders(actor, snapshot.orders);
    } catch { throw new HttpError(401, "UNAUTHORIZED", "Los datos temporales de pedidos no son válidos. Borra las cookies de la demo y recarga."); }
  }
  return () => {
    const value = snapshotSchema.parse({ sessionId: actor.sessionId, expires: Date.now() + 6 * 3600000, orders: services.snapshotOrders(actor) });
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${name}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/api/distributor; Max-Age=21600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  };
}
