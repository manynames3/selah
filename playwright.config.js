import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:8790", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/local.mjs --test",
    url: "http://127.0.0.1:8790/api/devotionals",
    reuseExistingServer: false,
    timeout: 120000
  }
});
