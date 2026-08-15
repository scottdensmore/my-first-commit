import { defineConfig, devices } from "@playwright/test";
import { resolveTargets, resolveWorkerCount } from "./scripts/e2e-server-identity.mjs";

// Both the target choice and the worker count are resolved in a unit-tested module rather than
// inline here, because no test imports this file.
const { localBaseUrl, baseUrl } = resolveTargets();

// Fixed rather than derived from the machine, so a run behaves the same on a laptop, in CI, and
// in an agent sandbox. Playwright's default is half the CPU count, which is why the same suite
// could pass on one machine and fail on another with no code change between them. Override with
// E2E_WORKERS to investigate a concurrency-sensitive failure.
const workers = resolveWorkerCount();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers,
  reporter: "list",
  // Rejects a foreign server on the local port before any spec runs. Playwright's
  // reuseExistingServer only checks that the port answers, not what answers.
  globalSetup: "./tests/e2e/globalSetup.ts",
  use: {
    // Never null in practice -- one of the two targets is always resolved -- but the helper is
    // plain JS, so narrow rather than assert.
    baseURL: baseUrl ?? undefined,
    trace: "on-first-retry",
  },
  webServer: localBaseUrl
    ? {
        command: `E2E_COMMIT_SEARCH_MOCKS=1 npm run dev -- -H ${new URL(localBaseUrl).hostname} -p ${new URL(localBaseUrl).port}`,
        url: localBaseUrl,
        // Kept on for local speed. Reuse is safe here only because globalSetup checks what the
        // port actually holds -- Playwright itself checks only that it answers.
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
