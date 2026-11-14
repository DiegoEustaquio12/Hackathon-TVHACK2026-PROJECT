import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { POST } from "@/app/api/distributor/orders/route";
import { DELETE } from "@/app/api/distributor/orders/[orderId]/route";
import { POST as activate } from "@/app/api/distributor/plans/route";
import { GET } from "@/app/api/distributor/dashboard/route";
import { createOrderSchema, deleteOrderSchema, planActivationSchema, recommendPlan, supplierPlans, type Actor } from "@/src/contracts";
import { resolveSession } from "@/src/modules/http/session";
import { createMockServices } from "@/src/modules/http/mocks/services";
import { orderCookieScope } from "@/src/modules/http/mocks/order-cookie";
import { mxnToCents } from "@/components/money";

const input = { customer: "Abarrotes Rivera", channel: "whatsapp", items_count: 3, total_cents: 12345 };
const req = (path: string, method = "GET", body?: unknown, cookie?: string) => new Request(`http://localhost:3000/api/distributor/${path}`, {
  method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
});
const remove = (orderId: string, body: unknown, cookie?: string, query = "") => DELETE(req(`orders/${orderId}${query}`, "DELETE", body, cookie), { params: Promise.resolve({ orderId }) });
beforeEach(() => vi.stubEnv("MOCK_MODE", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("order mutations and plan contracts", () => {
  it("converts decimal pesos exactly and rejects malformed amounts", () => {
    for (const [pesos, cents] of [["0", 0], ["0.29", 29], ["1.01", 101], ["1250.5", 125050], ["999999999.00", 99999999900]] as const) expect(mxnToCents(pesos)).toBe(cents);
    for (const value of ["", "-1", "1.005", "1,250.50", "1e3", "NaN", "1000000000", ".50"]) expect(mxnToCents(value)).toBeNull();
    expect(createOrderSchema.safeParse({ ...input, total_cents: 12.5 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...input, items_count: 1.5 }).success).toBe(false);
    expect(deleteOrderSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  });
  it("creates and removes orders, recalculates unfiltered KPIs and isolates business/session state", async () => {
    const { cookie } = await resolveSession(req("dashboard"));
    const before = await (await GET(req("dashboard", "GET", undefined, cookie))).json();
    const created = await POST(req("orders", "POST", input, cookie));
    expect(created.status).toBe(201);
    const order = await created.json();
    expect(order).toMatchObject({ ...input, status: "pending", version: 1 });
    expect(order.created_at).toMatch(/\.\d{3}Z$/);
    const after = await (await GET(req("dashboard?q=no-match", "GET", undefined, cookie))).json();
    expect(after.orders).toHaveLength(0);
    expect(after.kpis).toEqual({ orders_count: 7, pending_count: 3, active_count: 5, total_value_cents: before.kpis.total_value_cents + input.total_cents });
    expect((await remove(order.id, { expected_version: 2 }, cookie)).status).toBe(409);
    expect((await remove(order.id, { expected_version: 1 })).status).toBe(404);
    expect((await remove(order.id, { expected_version: 1 }, cookie)).status).toBe(200);
    expect((await remove(order.id, { expected_version: 1 }, cookie)).status).toBe(404);
    expect((await (await GET(req("dashboard", "GET", undefined, cookie))).json()).kpis).toEqual(before.kpis);
    const services = createMockServices();
    const actor: Actor = { businessId: "one", userId: "user", channel: "web", sessionId: randomUUID() };
    const own = await services.distributor.createOrder(actor, createOrderSchema.parse(input));
    await expect(services.distributor.deleteOrder({ ...actor, businessId: "two" }, own.id, { expected_version: 1 })).rejects.toMatchObject({ status: 404 });
  });
  it("rejects identity injection and unknown fields in all mutation bodies and queries", async () => {
    for (const field of ["businessId", "userId", "actor"]) {
      for (const response of [
        await POST(req("orders", "POST", { ...input, [field]: "other" })),
        await remove("PED-1042", { expected_version: 1, [field]: "other" }),
        await activate(req("plans", "POST", { planId: "initial", [field]: "other" })),
        await POST(req(`orders?${field}=other`, "POST", input)),
        await remove("PED-1042", { expected_version: 1 }, undefined, `?${field}=other`),
        await activate(req(`plans?${field}=other`, "POST", { planId: "initial" })),
      ]) { expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" }); }
    }
    expect((await remove("wrong", { expected_version: 1 })).status).toBe(400);
    expect((await POST(req("orders", "POST", { ...input, created_at: new Date().toISOString() }))).status).toBe(400);
    expect((await activate(req("plans", "POST", { planId: "initial", monthly_price_cents: 1 }))).status).toBe(400);
    const forbidden = new Request(req("orders/PED-1042", "DELETE", { expected_version: 1 }), { headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect((await DELETE(forbidden, { params: Promise.resolve({ orderId: "PED-1042" }) })).status).toBe(403);
  });
  it("requires verified sessions outside mock mode for all added endpoints", async () => {
    vi.stubEnv("MOCK_MODE", "false");
    for (const response of [await POST(req("orders", "POST", input)), await remove("PED-1042", { expected_version: 1 }), await activate(req("plans", "POST", { planId: "initial" }))]) {
      expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "UNAUTHORIZED", message: "Inicia sesión para continuar." });
    }
  });
  it("recommends by the larger requirement and derives activation price only on the server", async () => {
    expect(recommendPlan(50, 100)).toBe("initial"); expect(recommendPlan(51, 100)).toBe("featured");
    expect(recommendPlan(50, 101)).toBe("featured"); expect(recommendPlan(250, 500)).toBe("featured");
    expect(recommendPlan(251, 1)).toBe("total"); expect(recommendPlan(1, 501)).toBe("total");
    for (const plan of supplierPlans) {
      const response = await activate(req("plans", "POST", { planId: plan.id }));
      expect(response.status).toBe(201);
      expect(planActivationSchema.parse(await response.json())).toMatchObject({ planId: plan.id, monthly_price_cents: plan.monthly_price_cents, status: "mock_active" });
    }
  });
  it("persists additions, deletions and even an empty collection across serverless instances", async () => {
    const actor: Actor = { businessId: "demo-business", userId: "demo-user", channel: "web", sessionId: randomUUID() };
    const request = req("dashboard"); const first = createMockServices();
    const save = orderCookieScope(request, actor, first);
    const order = await first.distributor.createOrder(actor, createOrderSchema.parse(input));
    await first.distributor.deleteOrder(actor, "PED-1042", { expected_version: 1 });
    const cookie = save(); expect(Buffer.byteLength(cookie)).toBeLessThan(4096);
    const second = createMockServices();
    orderCookieScope(req("dashboard", "GET", undefined, cookie.split(";")[0]), actor, second);
    const restored = await second.distributor.dashboard(actor, {});
    expect(restored.orders.map(o => o.id)).toContain(order.id);
    expect(restored.orders.map(o => o.id)).not.toContain("PED-1042");
    const saveEmpty = orderCookieScope(request, actor, second);
    for (const item of restored.orders) await second.distributor.deleteOrder(actor, item.id, { expected_version: item.version });
    const third = createMockServices();
    orderCookieScope(req("dashboard", "GET", undefined, saveEmpty().split(";")[0]), actor, third);
    expect((await third.distributor.dashboard(actor, {})).orders).toEqual([]);
  });
  it("bounds demo growth before mutating and retains a browser-sized snapshot", async () => {
    const services = createMockServices();
    const actor: Actor = { businessId: "demo", userId: "user", channel: "web", sessionId: randomUUID() };
    const save = orderCookieScope(req("dashboard"), actor, services);
    for (let i = 0; i < 24; i++) await services.distributor.createOrder(actor, createOrderSchema.parse({ ...input, customer: `Comercio ${i} ${"á".repeat(50)}` }));
    expect(Buffer.byteLength(save())).toBeLessThan(4096);
    await expect(services.distributor.createOrder(actor, createOrderSchema.parse(input))).rejects.toMatchObject({ code: "DEMO_ORDER_LIMIT" });
    expect((await services.distributor.dashboard(actor, {})).kpis.orders_count).toBe(30);
  });
  it("does not roll back versions or resurrect deleted orders from an older signed cookie in the same instance", async () => {
    const services = createMockServices();
    const actor: Actor = { businessId: "demo", userId: "user", channel: "web", sessionId: randomUUID() };
    const save = orderCookieScope(req("dashboard"), actor, services);
    const oldCookie = save().split(";")[0];
    await services.distributor.updateStatus(actor, "PED-1042", { status: "confirmed", expected_version: 1 });
    await services.distributor.deleteOrder(actor, "PED-1043", { expected_version: 1 });
    orderCookieScope(req("dashboard", "GET", undefined, oldCookie), actor, services);
    const orders = (await services.distributor.dashboard(actor, {})).orders;
    expect(orders.find(o => o.id === "PED-1042")).toMatchObject({ version: 2, status: "confirmed" });
    expect(orders.some(o => o.id === "PED-1043")).toBe(false);
  });
});
