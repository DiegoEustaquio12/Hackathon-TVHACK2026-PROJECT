import { webApiPaths } from "../../contracts/health";
import type { HealthService } from "../../contracts/services";
import { isMockMode } from "./session";

export const healthService: HealthService = {
  async check() {
    return {
      status: "ok",
      service: "knectan-web",
      mockMode: isMockMode(),
      timestamp: new Date().toISOString(),
      endpoints: [
        ...webApiPaths,
        ...(process.env.INFOBIP_WEBHOOK_ENABLED === "true" ? ["/api/webhooks/infobip"] : []),
      ],
    };
  },
};
