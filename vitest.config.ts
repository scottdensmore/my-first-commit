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
    include: [
      "app/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "components/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
