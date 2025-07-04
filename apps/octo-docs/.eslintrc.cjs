module.exports = {
  extends: ['../../.eslintrc.cjs'],
  ignorePatterns: ['.docusaurus', 'build', 'lib', 'node_modules'],
  parserOptions: {
    ecmaVersion: '2022',
    extraFileExtensions: ['.json'],
    project: 'tsconfig.json',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
  },
  root: true,
  rules: {
    '@nx/enforce-module-boundaries': [
      'error',
      {
        allow: [],
        depConstraints: [
          {
            onlyDependOnLibsWithTags: ['scope:octo-docs'],
            sourceTag: 'scope:octo-docs',
          },
        ],
      },
    ],
    'import/no-unresolved': ['error', { ignore: ['^@docusaurus', '^@site', '^@theme'] }],
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
};
