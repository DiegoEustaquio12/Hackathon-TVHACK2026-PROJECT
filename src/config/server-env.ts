import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  MOCK_MODE: z.enum(["true", "false"]).default("true"),
  SESSION_SECRET: z.string().min(32).default("knectan-dev-secret-change-in-prod"),
  DEFAULT_BUSINESS_ID: z.string().min(1).default("biz_knectan_demo_001"),
  INFOBIP_WEBHOOK_ENABLED: z.enum(["true", "false"]).default("false"),
}).strict();

const parsed = serverEnvSchema.parse({
  MOCK_MODE: process.env.MOCK_MODE,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DEFAULT_BUSINESS_ID: process.env.DEFAULT_BUSINESS_ID,
  INFOBIP_WEBHOOK_ENABLED: process.env.INFOBIP_WEBHOOK_ENABLED,
});

export const SERVER_ENV = Object.freeze({
  mockMode: parsed.MOCK_MODE === "true",
  sessionSecret: parsed.SESSION_SECRET,
  defaultBusinessId: parsed.DEFAULT_BUSINESS_ID,
  infobipWebhookEnabled: parsed.INFOBIP_WEBHOOK_ENABLED === "true",
});
