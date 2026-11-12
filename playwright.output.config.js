import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: "output-windows.spec.js",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4318", trace: "retain-on-failure" },
  webServer: {
    command: "node test-support/output-browser-server.js",
    url: "http://127.0.0.1:4318",
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "narrow-touch", use: { ...devices["Pixel 7"] } }
  ]
});
