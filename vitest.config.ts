import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    // Unit tests cover product code only. The tooling-state directories hold external agent
    // configuration, and Vitest does not skip dot-directories on its own, so a stray test file
    // dropped there would otherwise be collected and run.
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "tests/e2e/**",
      ".claude/**",
      ".codex/**",
      ".entire/**",
      ".vercel/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
