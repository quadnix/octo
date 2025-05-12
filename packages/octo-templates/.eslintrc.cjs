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
            onlyDependOnLibsWithTags: ['scope:octo', 'scope:octo-aws-cdk', 'scope:octo-event-listeners'],
            sourceTag: 'scope:octo-templates',
          },
        ],
      },
    ],
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          {
            allow: [['templates', { family: '${from.family}' }]],
            from: ['templates'],
          },
        ],
      },
    ],
    'boundaries/external': ['off'],
  },
  settings: {
    'boundaries/elements': [
      {
        capture: ['family'],
        mode: 'folder',
        pattern: 'src/*',
        type: 'templates',
      },
    ],
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
};
