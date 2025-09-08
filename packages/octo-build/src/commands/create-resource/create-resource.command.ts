import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';
import { StringUtility } from '../../utilities/string/string.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createResourceCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the resource to create. Should be in kebab-case (e.g., my-awesome-resource).',
        type: 'string',
      })
      .option('package', {
        demandOption: true,
        description: 'Package name for the resource.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Root directory path of the CDK.',
        type: 'string',
      });
  },
  command: 'create-resource',
  describe: 'Create a new Octo resource.',
  handler: async (argv: ArgumentsCamelCase<{ name: string; package: string; path: string }>): Promise<void> => {
    const { name, package: packageName, path } = argv;

    // Validate resource name format (should be kebab-case)
    if (!StringUtility.isKebabCase(name)) {
      console.error(chalk.red('Resource name must be in kebab-case format (e.g., my-vpc)'));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating resource "${name}" with package "${packageName}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-resource-template/generators/app/index.js'), {
      namespace: 'generator-octo-resource-template:app',
    });

    try {
      await env.run(['generator-octo-resource-template:app', name, packageName, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created resource!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create resource! ${error.message}`));
      process.exit(1);
    }
  },
};
