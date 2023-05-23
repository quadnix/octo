// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs');

module.exports = {
  env: {
    jest: true,
    node: true,
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:jsonc/recommended-with-jsonc',
    'plugin:prettier/recommended',
  ],
  ignorePatterns: ['package-lock.json', 'dist'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    extraFileExtensions: ['.json'],
    project: 'tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'import', 'spellcheck'],
  root: true,
  rules: {
    '@typescript-eslint/explicit-function-return-type': 2,
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            from: ['./src/*/*/**'],
            target: './test',
          },
          {
            from: ['./src/v1', './src/v2'],
            target: './src/v0',
          },
          {
            from: ['./src/v0', './src/v2'],
            target: './src/v1',
          },
          {
            from: ['./src/v0', './src/v1'],
            target: './src/v2',
          },
        ],
      },
    ],
    'jsonc/sort-keys': [
      'error',
      'asc',
      { caseSensitive: true, minKeys: 2, natural: false },
    ],
    'sort-keys': [
      'error',
      'asc',
      { caseSensitive: true, minKeys: 2, natural: false },
    ],
    'spellcheck/spell-checker': [
      1,
      {
        minLength: 3,
        skipWords: readFileSync('./dictionary.dic').toString().split('\n'),
      },
    ],
  },
  settings: {
    // Fix to make `no-restricted-paths` rule work.
    // Source: https://github.com/import-js/eslint-plugin-import/issues/1928#issuecomment-715164532
    'import/resolver': {
      node: {
        extensions: ['.ts'],
      },
    },
  },
};
