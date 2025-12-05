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
                'scope:octo-event-listeners',
                'scope:octo-build',
              ],
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
    },
  },
];
