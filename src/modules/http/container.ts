import type { HttpServices, SessionVerifier } from "../../contracts/services";
import type { Actor } from "../../contracts/common";
import { createMockServices, type MockServices } from "./mocks/services";
import { orderCookieScope } from "./mocks/order-cookie";
import { HttpError } from "./errors";
import { isMockMode } from "./session";

type Runtime = { mocks: MockServices; services?: HttpServices; verifier?: SessionVerifier };
const scope = globalThis as typeof globalThis & { microaiHttp?: Runtime };
const runtime = scope.microaiHttp ??= { mocks: createMockServices() };

/** Server bootstrap integration point for R1/R2. Never call from a browser. */
export function configureHttp(services: HttpServices, verifier: SessionVerifier) {
  runtime.services = services; runtime.verifier = verifier;
}
export const getSessionVerifier = () => runtime.verifier;
export function prepareResponseCookie(request: Request, actor: Actor): (() => string) | undefined {
  if (isMockMode() && new URL(request.url).pathname.startsWith("/api/distributor/")) return orderCookieScope(request, actor, runtime.mocks);
}
export function getServices(): HttpServices {
  if (isMockMode()) return runtime.mocks;
  if (!runtime.services) throw new HttpError(503, "SERVICES_UNAVAILABLE", "Los servicios todavía no están conectados.");
  return runtime.services;
}
