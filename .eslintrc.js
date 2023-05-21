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
  parser: '@typescript-eslint/parser',
  parserOptions: {
    extraFileExtensions: ['.json'],
    project: 'tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  root: true,
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
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
  },
};
