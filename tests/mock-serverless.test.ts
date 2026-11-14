import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/src/contracts";
import { createMockServices } from "@/src/modules/http/mocks/services";
import { orderCookieScope } from "@/src/modules/http/mocks/order-cookie";

afterEach(() => vi.unstubAllEnvs());
it("restores signed order changes across separate serverless instances within cookie limits", async () => {
  vi.stubEnv("MOCK_MODE", "true");
  const actor: Actor = { businessId: "demo-business", userId: "demo-user", channel: "web", sessionId: randomUUID() };
  const request = new Request("https://demo.example/api/distributor/dashboard");
  const first = createMockServices();
  const saveCookie = orderCookieScope(request, actor, first);
  await first.distributor.updateStatus(actor, "PED-1042", { status: "confirmed", expected_version: 1 });
  const cookie = saveCookie(); expect(Buffer.byteLength(cookie)).toBeLessThan(4096);
  const second = createMockServices();
  orderCookieScope(new Request(request, { headers: { cookie: cookie.split(";")[0] } }), actor, second);
  expect((await second.distributor.dashboard(actor, {})).orders.find(order => order.id === "PED-1042")).toMatchObject({ status: "confirmed", version: 2 });
  expect(cookie).toContain("Secure");
  expect(() => orderCookieScope(new Request(request, { headers: { cookie: cookie.split(";")[0] + "x" } }), actor, second)).toThrow();
  const otherActor = { ...actor, sessionId: randomUUID() }; const other = createMockServices();
  orderCookieScope(new Request(request, { headers: { cookie: cookie.split(";")[0] } }), otherActor, other);
  expect((await other.distributor.dashboard(otherActor, {})).kpis.pending_count).toBe(2);
});
