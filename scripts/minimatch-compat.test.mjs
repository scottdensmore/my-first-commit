import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const matcher = require("@scottdensmore/minimatch-compat");
const adapterRequire = createRequire(require.resolve("@scottdensmore/minimatch-compat"));

describe("fixed minimatch compatibility", () => {
  it("keeps the actual fixed upstream package visible without modifying its version", () => {
    const metadata = require("@scottdensmore/minimatch-compat/package.json");
    expect(metadata.name).toBe("@scottdensmore/minimatch-compat");
    const upstream = adapterRequire("upstream-minimatch/package.json");
    expect(upstream.name).toBe("minimatch");
    expect(upstream.version).toBe("11.0.1");
  });

  it.each([
    ["src/file.js", "**/*.js", {}, true],
    ["src/file.ts", "**/*.js", {}, false],
    [".hidden.js", "*.js", { dot: true }, true],
    ["src/File.JS", "*.js", { matchBase: true, nocase: true }, true],
    ["file.js", "!*.ts", {}, true],
    ["file.js", "# comment", {}, false],
  ])("retains callable matching for %s", (file, pattern, options, expected) => {
    expect(matcher(file, pattern, options)).toBe(expected);
    expect(matcher.minimatch(file, pattern, options)).toBe(expected);
  });

  it("preserves the legacy helpers and chained default factories", () => {
    expect(matcher.makeRe("*.js").test("file.js")).toBe(true);
    expect(matcher.filter("*.js")("file.js")).toBe(true);
    expect(matcher.match(["file.js", "file.ts"], "*.js")).toEqual(["file.js"]);
    expect(matcher.braceExpand("file{1,2}.js")).toEqual(["file1.js", "file2.js"]);
    const configured = matcher.defaults({ nocase: true }).defaults({ dot: true });
    expect(configured(".FILE.JS", "*.js")).toBe(true);
    expect(configured.makeRe("*.js").test(".FILE.JS")).toBe(true);
    expect(new configured.Minimatch("*.js").match(".FILE.JS")).toBe(true);
    expect(matcher.defaults()).toBe(matcher);
  });

  it("supports ESM default and named imports", async () => {
    const esm = await import("@scottdensmore/minimatch-compat");
    expect(esm.default("file.js", "*.js")).toBe(true);
    expect(esm.minimatch("file.js", "*.js")).toBe(true);
    expect(new esm.Minimatch("*.js").match("file.js")).toBe(true);
    expect(esm.makeRe("*.js").test("file.js")).toBe(true);
  });

  it("runs the real import plugin path that requires a callable CommonJS export", () => {
    const { Linter } = require("eslint");
    const plugin = require("eslint-plugin-import");
    const messages = new Linter().verify("import value from './file.js';", [
      {
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: { import: plugin },
        rules: {
          "import/extensions": [
            "error",
            "always",
            { pattern: {}, pathGroupOverrides: [{ pattern: "**/*.js", action: "ignore" }] },
          ],
        },
      },
    ]);
    expect(messages).toEqual([]);
  });

  it("preserves the real no-internal-modules rule's makeRe(...).test(...) behavior", () => {
    const { Linter } = require("eslint");
    const plugin = require("eslint-plugin-import");
    const messages = new Linter().verify("import value from './private/file.js';", [
      {
        languageOptions: { ecmaVersion: 2022, sourceType: "module" },
        plugins: { import: plugin },
        rules: { "import/no-internal-modules": ["error", { forbid: ["private/**"] }] },
      },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("import/no-internal-modules");
  });

  it("bounds the advisory's first phase pattern amplification", () => {
    const pattern = "root/" + Array.from({ length: 12 }, (_, i) => `**/../dir${i}`).join("/");
    const compiled = new matcher.Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 32 });
    expect(compiled.globParts.length).toBeLessThanOrEqual(32);
  });

  it("skips quadratic deduplication for more than 1000 pattern alternatives", () => {
    const compiled = new matcher.Minimatch("*.js");
    const alternatives = Array.from({ length: 1001 }, (_, i) => [`dir${i}`, "**"]);
    expect(compiled.secondPhasePreProcess(alternatives)).toBe(alternatives);
  });
});
