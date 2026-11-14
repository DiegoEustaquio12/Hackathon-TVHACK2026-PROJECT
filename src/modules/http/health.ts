import { webApiPaths } from "../../contracts/health";
import type { HealthService } from "../../contracts/services";
import { isMockMode } from "./session";
import { SERVER_ENV } from "../../config/server-env";

export const healthService: HealthService = {
  async check() {
    return {
      status: "ok",
      service: "knectan-web",
      mockMode: isMockMode(),
      timestamp: new Date().toISOString(),
      endpoints: [
        ...webApiPaths,
        ...(SERVER_ENV.infobipWebhookEnabled ? ["/api/webhooks/infobip"] : []),
      ],
    };
  },
};
