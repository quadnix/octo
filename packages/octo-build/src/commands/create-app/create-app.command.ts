import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createAppCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('template', {
        alias: 't',
        choices: ['aws-dynamodb-service', 'aws-ecs-server', 'aws-s3-website'],
        demandOption: true,
        description: 'Template to use for creation.',
        type: 'string',
      })
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the app to create. A new directory will be created with the same name.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Path to create the app.',
        type: 'string',
      });
  },
  command: 'create-app',
  describe: 'Create a new Octo app from a template.',
  handler: async (argv: ArgumentsCamelCase<{ name: string; path: string; template: string }>): Promise<void> => {
    const { name, path, template } = argv;

    console.log(chalk.blue(`Creating app with template "${template}"...`));

    // The environment's cwd is both what yeoman watches for a package.json change and where it runs
    // the package manager install. It defaults to `process.cwd()` - the directory the user invoked
    // from - so with the app written to a subdirectory the watch never fired, and the install was
    // skipped with "No change to package.json was detected". It also anchors the paths yeoman logs.
    const env = createEnv({ cwd: resolve(join(path, name)) });
    env.register(resolve(__dirname, 'generator-octo-app-template/generators/app/index.js'), {
      namespace: 'generator-octo-app-template:app',
    });

    try {
      await env.run(['generator-octo-app-template:app', name, path, template], {
        skipCache: true,
        skipInstall: false,
      });

      console.log(chalk.green(`Successfully created app!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create app! ${error.message}`));
      process.exit(1);
    }
  },
};
