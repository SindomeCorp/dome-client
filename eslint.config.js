import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "public/**",
      // Mode file pulled from ace-builds; skip linting
      "src/client/ace/mode-moo.js",
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
    files: ["src/client/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
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
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": "off",
      "no-cond-assign": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
    },
  },
];
