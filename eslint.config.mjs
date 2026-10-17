import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import react from 'eslint-plugin-react';
import globals from 'globals';
import { createRequire } from 'node:module';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);

export default defineConfig({
  files: ['src/**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    tseslint.configs.recommended,
  ],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.jest,
      ...globals.node,
      ...globals.webextensions,
    },
  },
  settings: {
    // 'detect' calls context.getFilename(), which ESLint 10 removed.
    react: { version: require('react/package.json').version },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'react/prop-types': 'off',
    'no-console': 'warn',
  },
});
