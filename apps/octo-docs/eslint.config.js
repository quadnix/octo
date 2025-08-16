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
              onlyDependOnLibsWithTags: ['scope:octo-docs'],
              sourceTag: 'scope:octo-docs',
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
      'import/no-unresolved': ['error', { ignore: ['^@docusaurus', '^@generated', '^@site', '^@theme'] }],
    },
    settings: {
      'boundaries/elements': [
        {
          pattern: 'src',
          type: 'src',
        },
      ],
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    ignores: [
      'package-lock.json',
      '.docusaurus',
      'build',
      'coverage',
      'dist',
      'plugins/typedoc-api/lib',
      'node_modules',
    ],
  },
];
