import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import rootConfig from '../../eslint.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  ...rootConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: join(__dirname, 'tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            {
              onlyDependOnLibsWithTags: ['scope:octo', 'scope:octo-event-listeners'],
              sourceTag: 'scope:octo-event-listeners',
            },
          ],
        },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [],
        },
      ],
      'boundaries/external': ['off'],
    },
    settings: {
      'boundaries/elements': [
        {
          pattern: 'src',
          type: 'src',
        },
      ],
    },
  },
  {
    files: ['src/index.type.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message: 'index.type.ts publishes types only: re-export with `export type`.',
          selector: 'Program > :not(ExportNamedDeclaration[exportKind="type"])',
        },
      ],
    },
  },
];
