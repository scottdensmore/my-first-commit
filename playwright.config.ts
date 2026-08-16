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
    // `on-first-retry` was inert: `retries` is unset, so it defaults to 0, and there is never a
    // first retry to trace. Retrying would have made it fire, but it would also hide a flake by
    // turning it green, and a suite that runs three engines has more ways to flake than one that
    // runs a single engine. Retain on failure instead: the run still fails, and now it says why.
    trace: "retain-on-failure",
    // A cross-project failure is usually about what the page looked like in that engine at that
    // width, which a stack trace does not carry. Kept to failures so a green run writes nothing.
    screenshot: "only-on-failure",
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
    // Desktop Chrome runs every spec. The other two run a selected subset, chosen by tag, so
    // added coverage costs a few extra runs rather than tripling the suite. A spec earns a tag
    // by exercising something the extra project actually changes -- viewport and touch for
    // mobile, a different engine for WebKit -- not by being important.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 320px wide, which is both the narrowest realistic phone and what 200% zoom produces on
      // a 640px window -- the WCAG 1.4.10 reflow condition this repository already reasons
      // about. Chromium-backed, so it needs no browser beyond the one CI already installs.
      name: "mobile-chrome",
      use: { ...devices["Galaxy S9+"] },
      grep: /@mobile/,
    },
    {
      // The engine behind Safari, and the one place the clipboard, focus, and navigation
      // assumptions in this app are not simply Chromium's.
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grep: /@webkit/,
    },
  ],
});
