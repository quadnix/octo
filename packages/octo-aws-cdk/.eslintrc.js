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
    '@nx/enforce-module-boundaries': [
      'error',
      {
        allow: [],
        depConstraints: [
          {
            onlyDependOnLibsWithTags: ['scope:octo', 'scope:octo-aws-cdk'],
            sourceTag: 'scope:octo-aws-cdk',
          },
        ],
      },
    ],
  },
};
