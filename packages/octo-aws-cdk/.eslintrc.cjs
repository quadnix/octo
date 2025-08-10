module.exports = {
  extends: ['../../.eslintrc.cjs'],
  ignorePatterns: ['coverage', 'dist', 'node_modules', 'src/index.ts'],
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
            allow: [['anchor-schema', { family: '${from.family}' }], 'utilities'],
            from: ['anchor-anchor'],
          },
          {
            allow: [],
            from: ['anchor-schema'],
          },

          // Module rules.
          {
            allow: [
              ['module-models', { family: '${from.family}' }],
              ['module-module', { family: '${from.family}' }],
              'anchor-anchor',
              'anchor-schema',
              'resource-index',
              'resource-schema-index',
              'utilities',
            ],
            from: ['module-model-actions'],
          },
          {
            allow: [
              ['module-model-actions', { family: '${from.family}' }],
              ['module-models', { family: '${from.family}' }],
            ],
            from: ['module-model-indexes'],
          },
          {
            allow: ['resource-schema-index'],
            from: ['module-model-schemas'],
          },
          {
            allow: [
              ['module-model-schemas', { family: '${from.family}' }],
              'anchor-anchor',
              'anchor-schema',
              'utilities',
            ],
            from: ['module-models'],
          },
          {
            allow: [
              ['module-model-actions', { family: '${from.family}' }],
              ['module-model-indexes', { family: '${from.family}' }],
              ['module-schema-index', { family: '${from.family}' }],
              'anchor-anchor',
              'anchor-schema',
              'utilities',
            ],
            from: ['module-module'],
          },
          {
            allow: [
              ['module-index', { family: '${from.family}' }],
              ['module-schema-index', { family: '${from.family}' }],
              'anchor-schema',
              'resource-schema-index',
              'module-schema-index',
              'utilities',
            ],
            from: ['module-spec'],
          },
          {
            allow: [
              ['module-model-indexes', { family: '${from.family}' }],
              ['module-module', { family: '${from.family}' }],
            ],
            from: ['module-index'],
          },
          {
            allow: [
              ['module-model-indexes', { family: '${from.family}' }],
              ['module-model-schemas', { family: '${from.family}' }],
              'anchor-schema',
              'resource-schema-index',
            ],
            from: ['module-schema-index'],
          },

          // Resource rules.
          {
            allow: [
              ['resource-resource', { family: '${from.family}' }],
              ['resource-schema-index', { family: '${from.family}' }],
              'resource-schema-index',
              'utilities',
            ],
            from: ['resource-actions'],
          },
          {
            allow: [['resource-schema-index', { family: '${from.family}' }], 'resource-schema-index', 'utilities'],
            from: ['resource-resource'],
          },
          {
            allow: [
              ['resource-actions', { family: '${from.family}' }],
              ['resource-resource', { family: '${from.family}' }],
            ],
            from: ['resource-index'],
          },
          {
            allow: [],
            from: ['resource-schema-index'],
          },

          // Utility rules.
          {
            allow: ['resource-schema-index'],
            from: ['utilities'],
          },
        ],
      },
    ],
    'boundaries/external': ['off'],
  },
  settings: {
    'boundaries/dependency-nodes': ['export', 'import'],
    'boundaries/elements': [
      // Anchor patterns.
      {
        capture: ['family'],
        mode: 'file',
        pattern: 'src/anchors/*/*.anchor.ts',
        type: `anchor-anchor`,
      },
      {
        capture: ['family'],
        mode: 'file',
        pattern: 'src/anchors/*/*.anchor.schema.ts',
        type: `anchor-schema`,
      },

      // Module patterns.
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/**/*.action.ts'],
        type: 'module-model-actions',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/models/*/index.ts', 'src/modules/*/*/overlays/*/index.ts'],
        type: 'module-model-indexes',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/models/*/*.schema.ts', 'src/modules/*/*/overlays/*/*.schema.ts'],
        type: 'module-model-schemas',
      },
      {
        capture: ['familyCategory', 'family'],
        mode: 'file',
        pattern: ['src/modules/*/*/models/*/*.model.ts', 'src/modules/*/*/overlays/*/*.overlay.ts'],
        type: 'module-models',
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
      { capture: ['family'], mode: 'file', pattern: 'src/resources/*/index.ts', type: `resource-index` },
      {
        capture: ['family'],
        mode: 'file',
        pattern: 'src/resources/*/index.schema.ts',
        type: `resource-schema-index`,
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
