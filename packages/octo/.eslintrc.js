module.exports = {
  extends: ['../../.eslintrc.js'],
  ignorePatterns: ['coverage', 'dist', 'node_modules'],
  parserOptions: {
    extraFileExtensions: ['.json'],
    project: 'tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  root: true,
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            except: ['./octo'],
            from: '..',
            target: '.',
          },
        ],
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
