import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';
import { StringUtility } from '../../utilities/string/string.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createExternalResourceCommand = {
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
        description: 'Root directory path of the project.',
        type: 'string',
      });
  },
  command: 'create-external-resource',
  // Named for the lifecycle, not as the general case: a resource terraform manages is the common
  // one, and that is `create-terraform-resource`. This generator emits the other kind - a resource
  // whose add/delete run as SDK calls, which terraform drives by shelling back into `run-action`.
  describe: 'Create a new Octo resource whose lifecycle runs outside Terraform.',
  handler: async (argv: ArgumentsCamelCase<{ name: string; package: string; path: string }>): Promise<void> => {
    const { name, package: packageName, path } = argv;

    // Validate resource name format (should be kebab-case)
    if (!StringUtility.isKebabCase(name)) {
      console.error(chalk.red('Resource name must be in kebab-case format (e.g., my-vpc)'));
      process.exit(1);
    }

    // Rejected here rather than at registration: the decorator runs this same check, but only once
    // the generated resource is loaded, long after the files are on disk.
    if (!StringUtility.isValidPackageName(packageName)) {
      console.error(chalk.red(`Invalid package name "${packageName}"! Expected e.g. @octo or my-package.`));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating external resource "${name}" with package "${packageName}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-external-resource-template/generators/app/index.js'), {
      namespace: 'generator-octo-external-resource-template:app',
    });

    try {
      await env.run(['generator-octo-external-resource-template:app', name, packageName, path], {
        skipCache: true,
        skipInstall: true,
      });

      console.log(chalk.green(`Successfully created external resource!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create external resource! ${error.message}`));
      process.exit(1);
    }
  },
};
