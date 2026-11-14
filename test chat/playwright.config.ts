import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", launchOptions: { args: ["--use-fake-device-for-media-stream"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "chrome" : undefined) } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "chrome" : undefined) } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/chat", reuseExistingServer: false, timeout: 90_000,
    env: { MOCK_MODE: "true", LOCAL_CHAT_MODE: "true", LOCAL_CHAT_DIR: ".local-chat/e2e", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
