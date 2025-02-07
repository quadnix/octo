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
        default: 'disallow',
        rules: [
          // Anchor rules.
          {
            allow: ['utilities'],
            from: ['anchors'],
          },

          // Module rules.
          {
            allow: [
              ['module-*', { family: '${from.family}' }],
              'anchors',
              'resource-index',
              'resource-schema',
              'utilities',
            ],
            from: ['module-actions'],
          },
          {
            allow: [['module-*', { family: '${from.family}' }], 'anchors', 'utilities'],
            from: ['module-models', 'module-overlays'],
          },
          {
            allow: [['module-*', { family: '${from.family}' }], 'anchors', 'module-schema-index', 'utilities'],
            from: ['module-module'],
          },
          {
            allow: [
              ['module-*', { family: '${from.family}' }],
              'anchors',
              'module-schema-index',
              'resource-index',
              'resource-schema',
              'utilities',
            ],
            from: ['module-spec'],
          },
          {
            allow: ['module-models', 'module-overlays', 'resource-index'],
            from: ['module-index'],
          },
          {
            allow: [['module-*', { family: '${from.family}' }], 'anchors'],
            from: ['module-schema-index'],
          },

          // Resource rules.
          {
            allow: [
              ['resource-resource', { family: '${from.family}' }],
              ['resource-schema', { family: '${from.family}' }],
              'utilities',
            ],
            from: ['resource-actions'],
          },
          {
            allow: [['resource-schema', { family: '${from.family}' }], 'resource-schema', 'utilities'],
            from: ['resource-resource'],
          },
          {
            allow: [['resource-actions', { family: '${from.family}' }]],
            from: ['resource-index'],
          },
        ],
      },
    ],
    'boundaries/external': ['off'],
  },
  settings: {
    'boundaries/elements': [
      // Anchor patterns.
      {
        capture: ['family'],
        mode: 'folder',
        pattern: 'src/anchors/*',
        type: 'anchors',
      },

      // Module patterns.
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/**/*.action.ts'],
        type: 'module-actions',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/models/*/*.ts'],
        type: 'module-models',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/overlays/*/*.ts'],
        type: 'module-overlays',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: 'src/modules/*/*/*.module.ts',
        type: 'module-module',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: 'src/modules/*/*/*.module.spec.ts',
        type: 'module-spec',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: 'src/modules/*/*/index.ts',
        type: 'module-index',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: 'src/modules/*/*/index.schema.ts',
        type: 'module-schema-index',
      },

      // Resource patterns.
      {
        capture: ['family'],
        mode: 'folder',
        pattern: 'src/resources/*/actions',
        type: `resource-actions`,
      },
      {
        capture: ['family'],
        mode: 'file',
        pattern: 'src/resources/*/*.resource.ts',
        type: `resource-resource`,
      },
      {
        capture: ['family'],
        mode: 'file',
        pattern: 'src/resources/*/*.schema.ts',
        type: `resource-schema`,
      },
      { capture: ['family'], mode: 'file', pattern: 'src/resources/*/index.ts', type: `resource-index` },

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
