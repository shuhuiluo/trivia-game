import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import importXPlugin from "eslint-plugin-import-x";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/**"],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  prettierConfig,

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, "tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "import-x": importXPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: path.resolve(__dirname, "tsconfig.json"),
        },
      },
    },
    rules: {
      ...importXPlugin.configs.recommended.rules,
      ...importXPlugin.configs.typescript.rules,
      "prettier/prettier": "error",
      "no-console": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNever: true,
          allowBoolean: true,
          allowNumber: true,
          allowAny: true,
          allowNullish: true,
        },
      ],
      "@typescript-eslint/no-empty-function": [
        "error",
        {
          allow: ["arrowFunctions"],
        },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
    },
  }
);
