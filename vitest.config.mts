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
    // Coverage measures the files the suite loads, which is Vitest's default when `include` is
    // unset. It deliberately carries no patterns of its own: check-agent-docs.mjs reads every
    // glob-shaped string in this file as a collection root, so `exclude: ["**/*.config.*"]` here
    // would register `**` as a root and fail the gate — correctly, since it cannot tell a coverage
    // pattern from a widened test scope. Keeping this block pattern-free leaves `include` above
    // the only thing that answers "what does the unit run reach?".
    //
    // The trade-off is that a module no test imports at all is absent from the report rather than
    // counted as zero, so the floor below cannot catch a wholly untested new file — review can.
    // Scoping coverage to the two collection roots instead would count the metadata image routes
    // and the two npm-script entrypoints, which the gate exercises by running them rather than by
    // unit test: the floor would read 75% while measuring less than it does now.
    //
    // Thresholds are a non-regression floor set just under the measured numbers, not a target: a
    // change that leaves new code untested fails the gate, a change that improves coverage does
    // not silently raise the bar. Raise them when a deliberate push moves the numbers up.
    coverage: {
      provider: "v8",
      // The default reportsDirectory, `coverage/`, is ignored by Git, Prettier, and ESLint, so a
      // local run leaves no untracked noise behind.
      reporter: ["text", "html"],
      // Measured on this suite: 93.68% statements, 89.58% branches, 98.30% functions,
      // 94.66% lines. Each floor is the whole percent below its measurement, which is under a
      // point of slack — enough that a refactor does not fail on rounding, tight enough that a
      // few newly uncovered lines do.
      thresholds: {
        statements: 93,
        branches: 89,
        functions: 98,
        lines: 94,
      },
    },
  },
});
