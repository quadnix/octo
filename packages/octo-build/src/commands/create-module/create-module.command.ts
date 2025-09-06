import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AVAILABLE_MODEL_TYPES = [
  'account',
  'app',
  'deployment',
  'environment',
  'execution',
  'filesystem',
  'image',
  'pipeline',
  'region',
  'server',
  'service',
  'subnet',
] as const;

export const createModuleCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the module to create. Should be in kebab-case (e.g., my-awesome-region).',
        type: 'string',
      })
      .option('type', {
        alias: 't',
        choices: AVAILABLE_MODEL_TYPES,
        demandOption: true,
        description: 'Type of model this module is for.',
        type: 'string',
      })
      .option('package', {
        demandOption: true,
        description: 'Package name for the module.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Path to create the module.',
        type: 'string',
      });
  },
  command: 'create-module',
  describe: 'Create a new Octo module.',
  handler: async (
    argv: ArgumentsCamelCase<{ name: string; package: string; path: string; type: string }>,
  ): Promise<void> => {
    const { name, package: packageName, path, type } = argv;

    // Validate module name format (should be kebab-case)
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
      console.error(chalk.red('Module name must be in kebab-case format (e.g., my-awesome-region)'));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating module "${name}" of type "${type}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-module-template/generators/app/index.js'), {
      namespace: 'generator-octo-module-template:app',
    });

    try {
      await env.run(['generator-octo-module-template:app', name, type, packageName, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created module!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create module! ${error.message}`));
      process.exit(1);
    }
  },
};
