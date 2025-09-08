import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';
import { StringUtility } from '../../utilities/string/string.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createAnchorCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the anchor to create. Should be in kebab-case (e.g., my-awesome-thing).',
        type: 'string',
      })
      .option('family', {
        demandOption: true,
        description: 'Name of the anchor family. The anchor will be created under this directory.',
        type: 'string',
      })
      .option('type', {
        alias: 't',
        choices: [...StringUtility.AVAILABLE_MODEL_TYPES, 'overlay'],
        demandOption: true,
        description: 'Type of model this anchor is for.',
        type: 'string',
      })
      .option('package', {
        demandOption: true,
        description: 'Package name for the anchor.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Root directory path of the CDK.',
        type: 'string',
      });
  },
  command: 'create-anchor',
  describe: 'Create a new Octo anchor.',
  handler: async (
    argv: ArgumentsCamelCase<{ family: string; name: string; package: string; path: string; type: string }>,
  ): Promise<void> => {
    const { family, name, package: packageName, path, type } = argv;

    // Validate anchor name format (should be kebab-case)
    if (!StringUtility.isKebabCase(name)) {
      console.error(chalk.red('Anchor name must be in kebab-case format (e.g., my-awesome-thing)'));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating anchor "${name}" with parent "${type}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-anchor-template/generators/app/index.js'), {
      namespace: 'generator-octo-anchor-template:app',
    });

    try {
      await env.run(['generator-octo-anchor-template:app', name, family, type, packageName, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created anchor!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create anchor! ${error.message}`));
      process.exit(1);
    }
  },
};
