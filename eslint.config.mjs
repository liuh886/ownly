import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import obsidianmd from "eslint-plugin-obsidianmd";
import tsparser from "@typescript-eslint/parser";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "main.js",
    "styles.css",
    "next-env.d.ts",
  ]),
  {
    files: ["src/obsidian/**/*.ts", "src/obsidian/**/*.tsx"],
    plugins: { obsidianmd },
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.obsidian.json", tsconfigRootDir: process.cwd() },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["error", { allowAutoFix: false }],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: true }],
    },
  },
]);

export default eslintConfig;
