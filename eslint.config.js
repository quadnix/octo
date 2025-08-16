import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import jsonc from 'eslint-plugin-jsonc';
import prettier from 'eslint-plugin-prettier';
import spellcheck from 'eslint-plugin-spellcheck';
import globals from 'globals';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read dictionary words for spellcheck
const dictionarySkipWords = readFileSync(__dirname + '/dictionary.dic')
  .toString()
  .split('\n');

export default [
  // Base JavaScript config
  js.configs.recommended,

  // All files.
  {
    files: ['**/*.{js,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        NodeJS: true,
      },
    },
    plugins: {
      import: importPlugin,
      spellcheck: spellcheck,
    },
    rules: {
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'error',
      'import/order': [
        'error',
        {
          alphabetize: { caseInsensitive: false, order: 'asc', orderImportKind: 'asc' },
          named: { enabled: true, types: 'mixed' },
        },
      ],
      'max-len': ['error', { code: 120, ignoreStrings: true }],
      'no-async-promise-executor': 'off',
      'no-duplicate-imports': ['error', { includeExports: true }],
      'no-unused-vars': 'off',
      'sort-imports': [
        'error',
        {
          allowSeparatedGroups: true,
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
      'sort-keys': ['error', 'asc', { caseSensitive: false, minKeys: 2, natural: false }],
      'spellcheck/spell-checker': [
        'warn',
        {
          minLength: 3,
          skipWords: dictionarySkipWords,
        },
      ],
    },
  },

  // TypeScript files.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        project: './tsconfig.json',
        sourceType: 'module',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@nx': nx,
      '@typescript-eslint': tseslint,
      boundaries: boundaries,
      import: importPlugin,
      prettier,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
    settings: {
      boundaries: {
        elements: [
          {
            pattern: 'src',
            type: 'src',
          },
        ],
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },

  // JSON files.
  ...jsonc.configs['flat/recommended-with-jsonc'],
  {
    files: ['**/*.json', '**/*.jsonc'],
    rules: {
      'jsonc/sort-keys': ['error', 'asc', { caseSensitive: false, minKeys: 2, natural: false }],
    },
  },

  // Prettier integration.
  prettierConfig,

  // Global ignores.
  {
    ignores: ['package-lock.json', '.idea', '.nx', 'coverage', 'dist', 'node_modules'],
  },
];
