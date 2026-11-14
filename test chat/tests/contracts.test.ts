import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { chatInputSchema, centsSchema, dashboardQuerySchema, errorSchema, imageInputSchema, timestampSchema, updateOrderSchema } from "@/src/contracts";

describe("shared contracts", () => {
  it("rejects client tenancy on every message variant and nested unknown fields", () => {
    for (const input of [
      { kind: "text", text: "Hola" },
      { kind: "image", name: "foto.png", alt: "Anaquel", data_url: "data:image/png;base64,YQ==" },
      { kind: "audio", name: "audio.webm", data_url: "data:audio/webm;base64,YQ==" },
    ]) {
      const value = { ...input, clientMessageId: randomUUID() };
      expect(chatInputSchema.safeParse(value).success).toBe(true);
      expect(chatInputSchema.safeParse({ ...value, businessId: "other" }).success).toBe(false);
    }
    expect(dashboardQuerySchema.safeParse({ businessId: "other" }).success).toBe(false);
    expect(updateOrderSchema.safeParse({ status: "confirmed", expected_version: 1, businessId: "other" }).success).toBe(false);
  });
  it("accepts only integer cents and millisecond UTC timestamps", () => {
    expect(centsSchema.safeParse(12345).success).toBe(true);
    for (const value of [12.5, -1, Number.MAX_SAFE_INTEGER + 1]) expect(centsSchema.safeParse(value).success).toBe(false);
    expect(timestampSchema.safeParse("2026-11-14T18:00:00.000Z").success).toBe(true);
    for (const value of ["2026-11-14", "2026-11-14T12:00:00.000-06:00", "2026-11-14T18:00:00Z"]) expect(timestampSchema.safeParse(value).success).toBe(false);
  });
  it("rejects missing image descriptions, unsupported media, malformed and oversized base64", () => {
    const value = { kind: "image", clientMessageId: randomUUID(), name: "foto.png", alt: "Anaquel", data_url: "data:image/png;base64,YQ==" };
    for (const change of [{ alt: " " }, { data_url: "data:image/svg+xml;base64,YQ==" }, { data_url: "https://example.com/image.png" }, { data_url: "data:image/png;base64,***" }, { data_url: `data:image/png;base64,${"a".repeat(3_000_000)}` }]) expect(imageInputSchema.safeParse({ ...value, ...change }).success).toBe(false);
  });
  it("keeps the exact public error shape", () => {
    expect(errorSchema.safeParse({ code: "BAD", message: "Revisa los datos", stack: "secret" }).success).toBe(false);
  });
});
