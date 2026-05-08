// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm --prefix backend run dev",
      env: {
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "Admin12345!",
        HOST: "127.0.0.1",
        PORT: "59999",
        WORKSPACE_NAME: "Playwright Workspace"
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      url: "http://127.0.0.1:59999/api/health"
    },
    {
      command: "npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174",
      env: {
        VITE_API_BASE: "http://127.0.0.1:59999"
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      url: "http://127.0.0.1:5174"
    }
  ]
});
