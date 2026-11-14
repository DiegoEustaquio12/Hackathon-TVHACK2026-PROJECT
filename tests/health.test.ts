import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { errorSchema, healthSchema, type Actor } from "@/src/contracts";
import { healthService } from "@/src/modules/http/health";
import { resolveSession } from "@/src/modules/http/session";

const request = (query = "") => new Request(`https://demo.example/api/health${query}`, {
  headers: { cookie: "knectan_demo=invalid" },
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("public health diagnostics", () => {
  it.each(["true", "false", "TRUE", ""])("responds without a session or provider credentials (MOCK_MODE=%s)", async mode => {
    vi.stubEnv("MOCK_MODE", mode);
    vi.stubEnv("INFOBIP_WEBHOOK_ENABLED", "false");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    const health = healthSchema.parse(await response.json());
    expect(health).toMatchObject({ status: "ok", service: "knectan-web", mockMode: mode === "true" });
    expect(Math.abs(Date.now() - Date.parse(health.timestamp))).toBeLessThan(5000);
    expect(health.endpoints).not.toContain("/api/webhooks/infobip");
  });

  it("lists every registered API route when the optional webhook is enabled", async () => {
    vi.stubEnv("INFOBIP_WEBHOOK_ENABLED", "true");
    const health = healthSchema.parse(await (await GET(request())).json());
    const routes = readdirSync(new URL("../app/api/", import.meta.url), { recursive: true })
      .map(file => file.toString().replaceAll("\\", "/"))
      .filter(file => file.endsWith("/route.ts"))
      .map(file => `/api/${file.slice(0, -"/route.ts".length)}`);
    expect(health.endpoints.toSorted()).toEqual(routes.toSorted());
  });

  it.each(["?businessId=other", "?q=test", "?q=a&q=b"])("rejects unknown or repeated query parameters: %s", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(errorSchema.parse(await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("validates diagnostic output and normalizes failures without exposing internals", async () => {
    const check = vi.spyOn(healthService, "check");
    check.mockResolvedValueOnce({ status: "broken" } as never);
    const invalid = await GET(request());
    expect(invalid.status).toBe(500);
    expect(errorSchema.parse(await invalid.json()).code).toBe("INVALID_RESPONSE");
    check.mockRejectedValueOnce(new Error("secret provider config"));
    const failed = await GET(request());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ code: "INTERNAL_ERROR", message: "No pudimos completar la solicitud. Intenta de nuevo." });
  });
});

it("treats an incomplete verified actor as an invalid session", async () => {
  vi.stubEnv("MOCK_MODE", "false");
  await expect(resolveSession(request(), { verify: async () => ({ userId: "user" }) as Actor }))
    .rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
});
