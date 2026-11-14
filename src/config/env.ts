import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Knectan"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000/api"),
  NEXT_PUBLIC_ENDPOINT_HEALTH: z.string().startsWith("/").default("/api/health"),
  NEXT_PUBLIC_ENDPOINT_CHAT: z.string().startsWith("/").default("/api/chat/messages"),
  NEXT_PUBLIC_ENDPOINT_DASHBOARD: z.string().startsWith("/").default("/api/distributor/dashboard"),
  NEXT_PUBLIC_ENDPOINT_ORDERS: z.string().startsWith("/").default("/api/distributor/orders"),
  NEXT_PUBLIC_ENDPOINT_PLANS: z.string().startsWith("/").default("/api/distributor/plans"),
}).strict();

const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_ENDPOINT_HEALTH: process.env.NEXT_PUBLIC_ENDPOINT_HEALTH,
  NEXT_PUBLIC_ENDPOINT_CHAT: process.env.NEXT_PUBLIC_ENDPOINT_CHAT,
  NEXT_PUBLIC_ENDPOINT_DASHBOARD: process.env.NEXT_PUBLIC_ENDPOINT_DASHBOARD,
  NEXT_PUBLIC_ENDPOINT_ORDERS: process.env.NEXT_PUBLIC_ENDPOINT_ORDERS,
  NEXT_PUBLIC_ENDPOINT_PLANS: process.env.NEXT_PUBLIC_ENDPOINT_PLANS,
});

export const APP_CONFIG = Object.freeze({ name: publicEnv.NEXT_PUBLIC_APP_NAME });
export const URLS = Object.freeze({ app: publicEnv.NEXT_PUBLIC_APP_URL, apiBase: publicEnv.NEXT_PUBLIC_API_BASE_URL });
export const ENDPOINTS = Object.freeze({
  health: publicEnv.NEXT_PUBLIC_ENDPOINT_HEALTH,
  chat: publicEnv.NEXT_PUBLIC_ENDPOINT_CHAT,
  dashboard: publicEnv.NEXT_PUBLIC_ENDPOINT_DASHBOARD,
  orders: publicEnv.NEXT_PUBLIC_ENDPOINT_ORDERS,
  order: (orderId: string) => `${publicEnv.NEXT_PUBLIC_ENDPOINT_ORDERS}/${encodeURIComponent(orderId)}`,
  orderStatus: (orderId: string) => `${publicEnv.NEXT_PUBLIC_ENDPOINT_ORDERS}/${encodeURIComponent(orderId)}/status`,
  plans: publicEnv.NEXT_PUBLIC_ENDPOINT_PLANS,
});
