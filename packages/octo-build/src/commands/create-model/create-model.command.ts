import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';
import { StringUtility } from '../../utilities/string/string.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createModelCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description:
          'Name of the module where the model is created. Should be in kebab-case (e.g., my-awesome-region).',
        type: 'string',
      })
      .option('type', {
        alias: 't',
        choices: StringUtility.AVAILABLE_MODEL_TYPES,
        demandOption: true,
        description: 'Type of model this custom model is extending.',
        type: 'string',
      })
      .option('package', {
        demandOption: true,
        description: 'Package name for the model.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Root directory path of the CDK.',
        type: 'string',
      });
  },
  command: 'create-model',
  describe: 'Create a new Octo model.',
  handler: async (
    argv: ArgumentsCamelCase<{ name: string; package: string; path: string; type: string }>,
  ): Promise<void> => {
    const { name, package: packageName, path, type } = argv;

    // Validate module name format (should be kebab-case)
    if (!StringUtility.isKebabCase(name)) {
      console.error(chalk.red('Module name must be in kebab-case format (e.g., my-awesome-region)'));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating model for module "${name}" of type "${type}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-model-template/generators/app/index.js'), {
      namespace: 'generator-octo-model-template:app',
    });

    try {
      await env.run(['generator-octo-model-template:app', name, type, packageName, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created model!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create model! ${error.message}`));
      process.exit(1);
    }
  },
};
