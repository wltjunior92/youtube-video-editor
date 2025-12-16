import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import prettier from "eslint-plugin-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Configuração para arquivos JS e TS
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, prettier },
    extends: [
      "js/recommended", 
      "plugin:prettier/recommended",  // Habilita as regras do Prettier
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'prettier/prettier': 'error',  // Garante que o Prettier seja uma regra de erro
    },
  },
  tseslint.configs.recommended,
  
  // Configuração para arquivos JSON
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },

  // Configuração para arquivos Markdown
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },

  // Configuração para arquivos CSS
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
]);
