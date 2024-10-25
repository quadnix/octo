module.exports = {
  extends: ['../../.eslintrc.cjs'],
  ignorePatterns: ['coverage', 'dist', 'node_modules'],
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
            onlyDependOnLibsWithTags: ['scope:octo', 'scope:octo-aws-cdk'],
            sourceTag: 'scope:octo-aws-cdk',
          },
        ],
      },
    ],
    'boundaries/element-types': [
      'error',
      {
        default: 'allow',
        rules: [
          {
            allow: ['resources', 'utilities'],
            disallow: ['models', 'overlays'],
            from: ['resources'],
          },
        ],
      },
    ],
    'boundaries/external': ['off'],
  },
  settings: {
    'boundaries/elements': [
      {
        pattern: 'src/models',
        type: 'models',
      },
      {
        pattern: 'src/overlays',
        type: 'overlays',
      },
      {
        pattern: 'src/resources',
        type: 'resources',
      },
      {
        pattern: 'src/utilities',
        type: 'utilities',
      },
    ],
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
};
