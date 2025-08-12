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
            onlyDependOnLibsWithTags: ['scope:octo-build'],
            sourceTag: 'scope:octo-build',
          },
        ],
      },
    ],
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // Command rules.
          {
            allow: [['commands', { family: '${from.family}' }], 'utilities'],
            from: 'commands',
          },

          // Utility rules.
          {
            allow: [],
            from: 'utilities',
          },
        ],
      },
    ],
    'boundaries/external': ['off'],
  },
  settings: {
    'boundaries/dependency-nodes': ['export', 'import'],
    'boundaries/elements': [
      // Command patterns.
      {
        capture: ['family'],
        mode: 'folder',
        pattern: 'src/commands/*',
        type: 'commands',
      },

      // Utility patterns.
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
