(() => {
  const { readFileSync } = require('fs');

  const dictionarySkipWords = readFileSync(__dirname + '/dictionary.dic').toString().split('\n');

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
    ignorePatterns: ['package-lock.json'],
    overrides: [
      {
        files: ['*.ts'],
        rules: {
          '@typescript-eslint/no-non-null-assertion': 'off',
        },
      },
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: '2022',
      extraFileExtensions: ['.json'],
      project: 'tsconfig.json',
      sourceType: 'module',
      tsconfigRootDir: __dirname,
    },
    plugins: ['@nx', '@typescript-eslint/eslint-plugin', 'import', 'spellcheck'],
    root: true,
    rules: {
      '@typescript-eslint/explicit-function-return-type': 2,
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'jsonc/sort-keys': ['error', 'asc', { caseSensitive: false, minKeys: 2, natural: false }],
      'max-len': ['error', { code: 120, ignoreStrings: true }],
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
        1,
        {
          minLength: 3,
          skipWords: dictionarySkipWords,
        },
      ],
    },
  };
})();
