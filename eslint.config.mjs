import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "modules/{travelogue,auth,agent}/ui/**/*.{ts,tsx}",
      "components/{ui,kumo}/**/*.{ts,tsx}",
      "app/ui-preview/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/application/**",
                "./adapters/**",
                "../**/adapters/**",
                "@/modules/*/adapters/**",
                "./react/**",
                "../**/react/**",
                "@/modules/*/react/**",
                "**/server/**",
                "**/ports",
                "**/ports.ts",
                "@/modules/data/**",
                "@/modules/providers/**",
                "@/config/*server*",
              ],
              message:
                "UI accepts data and callbacks; connect services in the React layer.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "modules/{travelogue,auth,agent}/{application,model}/**/*.ts",
      "modules/{travelogue,auth,agent}/ports.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zustand",
              message: "Use zustand/vanilla in application code.",
            },
          ],
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "**/ui/**",
                "./adapters/**",
                "../**/adapters/**",
                "@/modules/*/adapters/**",
                "./react/**",
                "../**/react/**",
                "@/modules/*/react/**",
                "**/server/**",
                "@/modules/data/**",
              ],
              message:
                "Application logic uses ports and framework-independent models.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "modules/*/server/**/*.ts",
      "modules/data/**/*.ts",
      "config/*server*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/ui/**",
                "./react/**",
                "../**/react/**",
                "@/modules/*/react/**",
                "**/application/**",
                "./adapters/**",
                "../**/adapters/**",
                "@/modules/*/adapters/**",
                "@/components/**",
              ],
              message:
                "Server code must not depend on the frontend implementation.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["components/{ui,kumo}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@/modules/**", "../**/modules/**"] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".worktrees/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
