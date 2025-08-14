import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('template', {
        alias: 't',
        choices: ['aws-ecs-server', 'aws-s3-website'],
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
  command: 'create',
  describe: 'Create a new Octo app from a template.',
  handler: async (argv: ArgumentsCamelCase<{ template: string; name: string; path: string }>): Promise<void> => {
    const { template } = argv;

    console.log(chalk.blue(`Creating app with template "${template}"...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-app-template/generators/app/index.js'), {
      namespace: 'generator-octo-app-template:app',
    });
    await env.run(['generator-octo-app-template:app', 'hello'], {
      skipCache: true,
      skipInstall: true,
    });

    try {
      console.log(chalk.green(`Successfully created app!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create app! ${error.message}`));
      process.exit(1);
    }
  },
};
