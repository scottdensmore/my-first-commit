import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    // Unit tests cover product code only, so collection is scoped to where product code lives
    // rather than excluding the directories it must not reach. Vitest does not skip
    // dot-directories on its own and its default glob walks the whole tree, so a scratch spec a
    // tool or an agent drops at the repository root — or in any directory nobody has named yet —
    // used to join this run and fail it. Outside these roots there is nothing to name: the file is
    // not collected because it was never in scope. Root-anchored on purpose; `**/` prefixes would
    // give the walk the whole tree back. scripts/check-agent-docs.mjs pins this list, so add a
    // root there and in the verification exemption in AGENTS.md when one is deliberately added.
    include: ["app/**/*.{test,spec}.?(c|m)[jt]s?(x)", "scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    setupFiles: ["./vitest.setup.ts"],
    // Coverage measures the same roots the suite collects from, not merely the files it happens to
    // load. That distinction is the whole point: on Vitest's default scope a module no test imports
    // is *absent* from the report rather than counted as zero, so the floor below caught coverage
    // falling in code that was already tested and missed code arriving untested — which is the more
    // common way coverage degrades. Scoped, a new untested module drops the number and fails.
    //
    // Naming the roots here was impossible until the collection check learned to read only the
    // test `include` above; before that, any pattern in this block registered as a collection root
    // and failed the gate.
    //
    // Every exclusion below is a file the gate does cover, by running it rather than by importing
    // it, so counting it as zero would report a hole that is not there:
    //   - the three metadata image routes are prerendered by `next build`, and a browser spec
    //     asserts each returns a PNG
    //   - check-agent-docs.mjs and sync-labels.mjs are executed by `npm run check:agent-docs` and
    //     `npm run check:labels`, both links in the gate chain
    //   - verify-deployed-commit.mjs and resolve-active-deployment.mjs are executed by the
    //     production health and promotion workflows
    // Each is a thin shell over a module that *is* unit tested — gate-commands, ignore-entries,
    // label-plan, production-release — which is this repository's deliberate split. Add to this
    // list only when another gate command genuinely covers the file, and say which one.
    coverage: {
      provider: "v8",
      include: ["app/**", "scripts/**"],
      exclude: [
        "app/icon.tsx",
        "app/opengraph-image.tsx",
        "app/twitter-image.tsx",
        "scripts/check-agent-docs.mjs",
        "scripts/sync-labels.mjs",
        "scripts/verify-deployed-commit.mjs",
        "scripts/resolve-active-deployment.mjs",
      ],
      // The default reportsDirectory, `coverage/`, is ignored by Git, Prettier, and ESLint, so a
      // local run leaves no untracked noise behind.
      reporter: ["text", "html"],
      // Thresholds are a non-regression floor set just under the measured numbers, not a target: a
      // change that leaves new code untested fails the gate, a change that improves coverage does
      // not silently raise the bar. Raise them when a deliberate push moves the numbers up.
      //
      // Unchanged by the rescoping, which is the evidence the exclusions are right rather than
      // convenient: scoped and excluded measures 93.71% statements, 89.73% branches, 98.38%
      // functions, 94.65% lines — the same figures the default scope reported, to two decimals.
      // Without the exclusions it reads 74.49%, and all of that gap is the seven files above.
      thresholds: {
        statements: 93,
        branches: 89,
        functions: 98,
        lines: 94,
      },
    },
  },
});
