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
              onlyDependOnLibsWithTags: [
                'scope:octo',
                'scope:octo-aws-cdk',
                'scope:octo-event-listeners',
                'scope:octo-templates',
              ],
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
    },
  },
];
