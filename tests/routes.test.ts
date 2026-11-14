import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { GET as getHistory, POST as postMessage } from "@/app/api/chat/messages/route";
import { GET as getDashboard } from "@/app/api/distributor/dashboard/route";
import { PATCH } from "@/app/api/distributor/orders/[orderId]/status/route";
import { actorSchema, dashboardSchema, errorSchema, historySchema, orderSchema, sendMessageResponseSchema } from "@/src/contracts";
import { configureHttp } from "@/src/modules/http/container";
import { createMockServices } from "@/src/modules/http/mocks/services";
import { handle } from "@/src/modules/http/handler";
import { resolveSession } from "@/src/modules/http/session";

const url = "http://localhost:3000";
function request(path: string, cookie?: string, body?: unknown, method = "GET") {
  return new Request(`${url}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function session() { const response = await getHistory(request("/api/chat/messages")); return response.headers.get("set-cookie")!.split(";")[0]; }
const patch = (cookie: string, body: unknown, orderId = "PED-1042", query = "") => PATCH(request(`/api/distributor/orders/${orderId}/status${query}`, cookie, body, "PATCH"), { params: Promise.resolve({ orderId }) });

beforeEach(() => { vi.stubEnv("MOCK_MODE", "true"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("real route exports against mock services", () => {
  it("accepts same-origin browser writes when Next uses an internal hostname", async () => {
    const cookie = await session();
    const response = await postMessage(new Request("http://localhost:3000/api/chat/messages", {
      method: "POST", headers: { cookie, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ kind: "text", text: "Desde el navegador", clientMessageId: randomUUID() }),
    }));
    expect(response.status).toBe(201);
  });
  it("creates a server-only signed session and accepts text, image, audio with history and idempotency", async () => {
    const response = await getHistory(request("/api/chat/messages"));
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    for (const content of [{ kind: "text", text: "a".repeat(2000) }, { kind: "image", name: "foto.png", alt: "Estante", data_url: "data:image/png;base64,YQ==" }, { kind: "audio", name: "voz.webm", data_url: "data:audio/webm;base64,YQ==" }]) {
      const body = { ...content, clientMessageId: randomUUID() };
      const sent = await postMessage(request("/api/chat/messages", cookie, body, "POST"));
      expect(sent.status).toBe(201); const result = sendMessageResponseSchema.parse(await sent.json());
      const duplicate = await postMessage(request("/api/chat/messages", cookie, body, "POST"));
      expect(await duplicate.json()).toEqual(result);
      const conflict = await postMessage(request("/api/chat/messages", cookie, { ...body, text: "distinto" }, "POST"));
      expect(conflict.status).toBe(409);
    }
    const history = historySchema.parse(await (await getHistory(request("/api/chat/messages", cookie))).json());
    expect(history.messages).toHaveLength(6);
    const other = historySchema.parse(await (await getHistory(request("/api/chat/messages", await session()))).json());
    expect(other.messages).toHaveLength(0);
  });
  it("rejects tenancy injection in body and queries, unknown fields and repeated parameters", async () => {
    const cookie = await session();
    const responses = await Promise.all([
      getHistory(request("/api/chat/messages?businessId=other", cookie)),
      postMessage(request("/api/chat/messages", cookie, { kind: "text", text: "Hola", clientMessageId: randomUUID(), businessId: "other" }, "POST")),
      getDashboard(request("/api/distributor/dashboard?businessId=other", cookie)),
      getDashboard(request("/api/distributor/dashboard?status=pending&status=delivered", cookie)),
      patch(cookie, { status: "confirmed", expected_version: 1, businessId: "other" }),
      patch(cookie, { status: "confirmed", expected_version: 1 }, "PED-1042", "?businessId=other"),
      patch(cookie, { status: "unknown", expected_version: 1 }),
    ]);
    for (const response of responses) { expect(response.status).toBe(400); expect(errorSchema.parse(await response.json()).code).toBe("VALIDATION_ERROR"); }
  });
  it("filters orders, updates status and KPIs, detects conflicts and isolates sessions", async () => {
    const cookie = await session();
    const pending = dashboardSchema.parse(await (await getDashboard(request("/api/distributor/dashboard?status=pending", cookie))).json());
    expect(pending.orders).toHaveLength(2);
    const response = await patch(cookie, { status: "confirmed", expected_version: 1 });
    expect(response.status).toBe(200); expect(orderSchema.parse(await response.json()).version).toBe(2);
    expect((await patch(cookie, { status: "confirmed", expected_version: 1 })).status).toBe(409);
    expect((await patch(cookie, { status: "delivered", expected_version: 2 })).status).toBe(409);
    expect((await patch(cookie, { status: "confirmed", expected_version: 1 }, "PED-9999")).status).toBe(404);
    const after = dashboardSchema.parse(await (await getDashboard(request("/api/distributor/dashboard", cookie))).json());
    expect(after.kpis.pending_count).toBe(1);
    const isolated = dashboardSchema.parse(await (await getDashboard(request("/api/distributor/dashboard", await session()))).json());
    expect(isolated.kpis.pending_count).toBe(2);
    const empty = dashboardSchema.parse(await (await getDashboard(request("/api/distributor/dashboard?q=does-not-exist", cookie))).json()); expect(empty.orders).toHaveLength(0);
  });
  it("normalizes malformed JSON, wrong content type, forbidden origins and oversized requests", async () => {
    const cookie = await session();
    for (const [headers, body, status, code] of [
      [{ "content-type": "application/json" }, "{", 400, "INVALID_JSON"],
      [{ "content-type": "text/plain" }, "x", 415, "UNSUPPORTED_MEDIA_TYPE"],
      [{ "content-type": "application/json", origin: "https://attacker.example" }, "{}", 403, "FORBIDDEN_ORIGIN"],
      [{ "content-type": "application/json" }, "x".repeat(3 * 1024 * 1024 + 1), 413, "PAYLOAD_TOO_LARGE"],
    ] as const) {
      const response = await postMessage(new Request(`${url}/api/chat/messages`, { method: "POST", headers: { ...headers, cookie }, body }));
      expect(response.status).toBe(status); expect(errorSchema.parse(await response.json()).code).toBe(code);
    }
  });
  it("fails closed without a verified session outside mock mode and rejects tampered/expired mock cookies", async () => {
    vi.stubEnv("MOCK_MODE", "false");
    const endpoints = [getHistory(request("/api/chat/messages")), postMessage(request("/api/chat/messages", undefined, {}, "POST")), getDashboard(request("/api/distributor/dashboard")), patch("microai_demo=fake", {})];
    for (const response of await Promise.all(endpoints)) { expect(response.status).toBe(401); expect(errorSchema.parse(await response.json()).code).toBe("UNAUTHORIZED"); }
    vi.stubEnv("MOCK_MODE", "true");
    const cookie = await session();
    expect((await getHistory(request("/api/chat/messages", cookie + "x"))).status).toBe(401);
    const now = Date.now(); const spy = vi.spyOn(Date, "now").mockReturnValue(now + 7 * 3600000);
    expect((await getHistory(request("/api/chat/messages", cookie))).status).toBe(401); spy.mockRestore();
  });
  it("validates service responses and never exposes internal errors", async () => {
    const response = await handle(request("/api/test"), dashboardSchema, async () => ({ invalid: true } as never));
    expect(response.status).toBe(500); expect((await response.json()).code).toBe("INVALID_RESPONSE");
    const failure = await handle(request("/api/test"), dashboardSchema, async () => { throw new Error("secret credentials"); });
    expect(await failure.json()).toEqual({ code: "INTERNAL_ERROR", message: "No pudimos completar la solicitud. Intenta de nuevo." });
  });
  it("uses only the production verifier actor, and a demo cookie cannot authenticate production", async () => {
    const cookie = await session(); vi.stubEnv("MOCK_MODE", "false");
    await expect(resolveSession(request("/api/chat/messages", cookie))).rejects.toMatchObject({ status: 401 });
    const actor = actorSchema.parse({ userId: "real-user", businessId: "verified-business", channel: "web", sessionId: randomUUID() });
    const services = createMockServices(); const verify = vi.fn(async () => actor);
    configureHttp(services, { verify });
    expect((await getDashboard(request("/api/distributor/dashboard"))).status).toBe(200);
    expect(verify).toHaveBeenCalledOnce();
    configureHttp(services, { verify: async () => null });
  });
});
