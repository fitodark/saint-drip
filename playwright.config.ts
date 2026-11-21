// E2E runner. Starts the backend (9000) and the storefront (8000) unless they are already running.
// Requires: npm run services:up, and Bootstrap's seed + write-storefront-env (blueprint §10).
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/blueprints/**", "**/fixtures/**", "**/helpers/**"],
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8000",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm --prefix apps/backend run dev",
      url: "http://localhost:9000/health",
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: "npm --prefix apps/storefront run dev",
      url: "http://localhost:8000/mx",
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
})
