import { describe, expect, it } from "vitest";
import { installedBrowsers, requiredEngines, runsBrowserSuite } from "./browser-projects.mjs";

// Fixture strings rather than the real files, as ignore-entries.test.mjs does: these cases pin the
// reading, and reading the real config would make them change every time a project is added.
const DEVICE_ENGINES = {
  "Desktop Chrome": "chromium",
  "Desktop Safari": "webkit",
  "Galaxy S9+": "chromium",
};

const CONFIG = `
export default defineConfig({
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Galaxy S9+"] }, grep: /@mobile/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@webkit/ },
  ],
});
`;

describe("requiredEngines", () => {
  it("maps each project to the engine it actually runs on", () => {
    // The point of the whole module: `mobile-chrome` is a Chromium project. Reading project names
    // would demand a browser called "mobile-chrome" and miss that chromium is what it needs.
    expect([...requiredEngines(CONFIG, DEVICE_ENGINES)].sort()).toEqual(["chromium", "webkit"]);
  });

  it("reads a project that names its browser directly", () => {
    const source = `projects: [{ name: "ff", use: { browserName: "firefox" } }]`;

    expect([...requiredEngines(source, DEVICE_ENGINES)]).toEqual(["firefox"]);
  });

  it("does not stop at the first nested bracket", () => {
    // A `use` object contains brackets, so matching to the first `]` would end inside project one
    // and silently under-report every project after it -- reporting fewer required browsers than
    // there are, which is the direction that lets a missing install through.
    const engines = requiredEngines(CONFIG, DEVICE_ENGINES);

    expect(engines.has("webkit")).toBe(true);
  });

  it("refuses a device Playwright does not define, rather than skipping it", () => {
    const source = `projects: [{ name: "x", use: { ...devices["Pixel 99"] } }]`;

    expect(() => requiredEngines(source, DEVICE_ENGINES)).toThrow(/Pixel 99/);
  });

  it("refuses a project it cannot read at all", () => {
    // Silently returning nothing here would let a project ship with no workflow installing its
    // browser, which is the failure this exists to prevent.
    const source = `projects: [{ name: "x", use: someSpreadThisCheckCannotResolve }]`;

    expect(() => requiredEngines(source, DEVICE_ENGINES)).toThrow(/teach this check/);
  });

  it("refuses a config with no projects array", () => {
    expect(() => requiredEngines("export default defineConfig({})", DEVICE_ENGINES)).toThrow(
      /no `projects:` array/,
    );
  });
});

describe("runsBrowserSuite", () => {
  it("counts a workflow that runs the suite directly", () => {
    expect(runsBrowserSuite("      - run: npm run test:e2e\n")).toBe(true);
  });

  it("counts a workflow that runs it through the gate", () => {
    // `npm run validate` chains the suite. Checking only test:e2e would have passed CI's workflow
    // while it was the production one that broke -- and would pass the reverse case too.
    expect(runsBrowserSuite("      - run: npm run validate\n")).toBe(true);
  });

  it("ignores a workflow that runs neither", () => {
    expect(runsBrowserSuite("      - run: npm run check:labels\n")).toBe(false);
  });
});

describe("installedBrowsers", () => {
  it("reads the browsers an install step names", () => {
    const source = "      - run: npx playwright install --with-deps chromium webkit\n";

    expect([...installedBrowsers(source)].sort()).toEqual(["chromium", "webkit"]);
  });

  it("ignores flags, so --with-deps is not read as a browser", () => {
    const source = "      - run: npx playwright install --with-deps chromium\n";

    expect([...installedBrowsers(source)]).toEqual(["chromium"]);
  });

  it("treats an unqualified install as every browser, not as none", () => {
    // `npx playwright install` with no browser installs all of them. Reading that as an empty
    // list would report a workflow as broken precisely when it is the most complete.
    expect(installedBrowsers("      - run: npx playwright install\n").size).toBe(0);
  });

  it("distinguishes no install step from an unqualified one", () => {
    expect(installedBrowsers("      - run: npm ci\n")).toBeNull();
  });

  it("combines multiple install steps", () => {
    const source = [
      "      - run: npx playwright install --with-deps chromium",
      "      - run: npx playwright install webkit",
    ].join("\n");

    expect([...installedBrowsers(source)].sort()).toEqual(["chromium", "webkit"]);
  });
});
