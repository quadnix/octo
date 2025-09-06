import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';
import { StringUtility } from '../../utilities/string/string.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createOverlayCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the module to create overlay for. Should be in kebab-case (e.g., my-awesome-region).',
        type: 'string',
      })
      .option('type', {
        alias: 't',
        choices: StringUtility.AVAILABLE_MODEL_TYPES,
        demandOption: true,
        description: 'Type of model this module is for.',
        type: 'string',
      })
      .option('package', {
        demandOption: true,
        description: 'Package name for the module.',
        type: 'string',
      })
      .option('overlay', {
        demandOption: true,
        description: 'Overlay name for the module.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Path to create the overlay.',
        type: 'string',
      });
  },
  command: 'create-overlay',
  describe: 'Create a new Octo overlay.',
  handler: async (
    argv: ArgumentsCamelCase<{ name: string; overlay: string; package: string; path: string; type: string }>,
  ): Promise<void> => {
    const { name, overlay, package: packageName, path, type } = argv;

    // Validate module and overlay name format (should be kebab-case)
    if (!StringUtility.isKebabCase(name) || !StringUtility.isKebabCase(overlay)) {
      console.error(chalk.red('Module/Overlay name must be in kebab-case format (e.g., my-awesome-region)'));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating overlay for module "${name}" of type "${type}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-overlay-template/generators/app/index.js'), {
      namespace: 'generator-octo-overlay-template:app',
    });

    try {
      await env.run(['generator-octo-overlay-template:app', name, type, packageName, overlay, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created overlay!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create overlay! ${error.message}`));
      process.exit(1);
    }
  },
};
