import { defineConfig, devices } from "@playwright/test";

const deployedBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const localBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: deployedBaseUrl ?? localBaseUrl,
    trace: "on-first-retry",
  },
  webServer: deployedBaseUrl
    ? undefined
    : {
        command: "E2E_COMMIT_SEARCH_MOCKS=1 npm run dev -- -H 127.0.0.1 -p 3100",
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
