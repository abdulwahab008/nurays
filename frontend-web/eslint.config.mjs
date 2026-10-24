import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // None left (FE-7): an API answer gets a type, a caught error is `unknown` read through lib/api-client.ts
      // (apiErrorMessage, apiErrorCode, apiErrorStatus, apiErrorDetails).
      "@typescript-eslint/no-explicit-any": "error",
      // Off: it reports `useEffect(() => { void load(); }, [load])` whenever `load` is an async function that sets
      // state after an `await` (it does not see the await), which is how every page here loads its data. The same
      // code written with `.then` passes, so it is a false positive, not a cascading render.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
