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
    // Vendored / generated / non-source assets — not our code to lint:
    "public/**", // committed VAD + onnxruntime bundles (minified third-party)
    "test-results/**", // throwaway QA-run artifacts
  ]),
  // One-off data / ingestion / setup scripts process dynamic external JSON and
  // are run via tsx (not type-checked at build). `any` is acceptable there; the
  // app under src/ stays strict.
  {
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
