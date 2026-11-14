import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { orderSchema, type Actor } from "../../../contracts";
import type { MockServices } from "./services";
import { HttpError } from "../errors";

const name = "knectan_demo_orders";
export const MAX_DEMO_ORDERS = 30;
const snapshotSchema = z.object({ sessionId: z.string().uuid(), expires: z.number().int(), revision: z.number().int().nonnegative().safe(), orders: z.array(orderSchema).max(MAX_DEMO_ORDERS) }).strict();
const sign = (payload: string) => createHmac("sha256", process.env.MOCK_SESSION_SECRET || "knectan-public-demo-only-v1").update(`orders:${payload}`).digest("base64url");

function encodeSnapshot(actor: Actor, orders: z.infer<typeof orderSchema>[], revision: number) {
  const value = snapshotSchema.parse({ sessionId: actor.sessionId, expires: Date.now() + 6 * 3600000, revision, orders });
  const payload = deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64url");
  if (payload.length > 3500) throw new HttpError(409, "DEMO_STORAGE_LIMIT", "La demo alcanzó su capacidad temporal. Quita un pedido antes de agregar otro.");
  return payload;
}
/** Check before mutation so a browser cookie never silently loses a successful write. */
export function assertOrderSnapshotFits(actor: Actor, orders: z.infer<typeof orderSchema>[]) { encodeSnapshot(actor, orders, Number.MAX_SAFE_INTEGER); }

/** A small signed demo snapshot lets separate serverless route instances share order changes. */
export function orderCookieScope(request: Request, actor: Actor, services: MockServices): () => string {
  const token = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
  if (token) {
    try {
      if (token.length > 3800) throw new Error();
      const [payload, signature, extra] = token.split(".");
      const expected = Buffer.from(sign(payload)); const actual = Buffer.from(signature || "");
      if (extra !== undefined || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
      const snapshot = snapshotSchema.parse(JSON.parse(inflateRawSync(Buffer.from(payload, "base64url"), { maxOutputLength: 65536 }).toString("utf8")));
      if (snapshot.sessionId === actor.sessionId && snapshot.expires > Date.now()) services.restoreOrders(actor, snapshot.orders, snapshot.revision);
    } catch { throw new HttpError(401, "UNAUTHORIZED", "Los datos temporales de pedidos no son válidos. Borra las cookies de la demo y recarga."); }
  }
  return () => {
    const payload = encodeSnapshot(actor, services.snapshotOrders(actor), services.snapshotOrderRevision(actor));
    return `${name}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/api/distributor; Max-Age=21600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  };
}
