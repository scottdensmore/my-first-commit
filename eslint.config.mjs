import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tooling state managed by external agent tools, matching .prettierignore. Flat config does
    // not skip dot-directories on its own, so without these an agent hook or script dropped here
    // would be linted as project source.
    ".claude/**",
    ".codex/**",
    ".entire/**",
    ".vercel/**",
  ]),
]);

export default eslintConfig;
