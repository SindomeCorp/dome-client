import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".stryker-tmp/**",
      "public/**",
      // Mode file pulled from ace-builds; skip linting
      "src/client/features/editor/ace/mode-moo.js",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      indent: ["error", 2],
      quotes: ["error", "double"],
      semi: ["error", "always"],
    },
  },
  {
    files: ["src/client/**/*.{js,jsx}"],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.worker,
        socket: "writable",
        MOO_STATUS_ENUM: "readonly",
        SOCKET_STATE_ENUM: "readonly",
        $: "readonly",
        _: "readonly",
        logger: "readonly",
        subs: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-empty": "off",
      "no-cond-assign": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
    },
  },
  {
    // JSX component names are not tracked as references by core ESLint.
    files: ["src/client/**/*.jsx"],
    rules: { "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z]", argsIgnorePattern: "^_" }] },
  },
  {
    files: ["src/shared/context-menus.js", "test-support/context-menu-reference-fixture.js"],
    languageOptions: { ecmaVersion: 2025 },
  },
];
