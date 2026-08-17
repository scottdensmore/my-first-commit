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
    //   - e2eCommitSearchFixtures.ts is executed by the browser suite, which the gate runs; every
    //     case in it exists to be reached through a browser and has no unit test to lose
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
        "app/_lib/e2eCommitSearchFixtures.ts",
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
      // Each floor is the whole percent below its measurement, which is under a point of slack:
      // enough that a refactor does not fail on rounding, tight enough that a few newly uncovered
      // lines do. Measured 96.53% statements, 93.26% branches, 98.91% functions, 97.72% lines.
      //
      // Raised when the browser fixtures moved out of actions.ts. That was not a coverage push --
      // it removed 173 lines no unit test could reach from a file that also holds the production
      // search path, taking actions.ts from 76.54% to 93.33% statements. Leaving the floors where
      // they were would have left three and a half points of slack, which is room for real
      // regression to pass.
      thresholds: {
        statements: 96,
        branches: 93,
        functions: 98,
        lines: 97,
      },
    },
  },
});
