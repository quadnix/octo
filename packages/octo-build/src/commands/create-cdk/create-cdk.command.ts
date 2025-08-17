import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { type ArgumentsCamelCase, type Argv } from 'yargs';
import { createEnv } from 'yeoman-environment';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createCdkCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('name', {
        alias: 'n',
        demandOption: true,
        description: 'Name of the CDK to create. A new directory will be created with the same name.',
        type: 'string',
      })
      .option('path', {
        alias: 'p',
        default: '.',
        description: 'Path to create the CDK.',
        type: 'string',
      })
      .option('options', {
        alias: 'o',
        description: `Options to create the CDK.
        
        Allowed options:
          
          withExamples [boolean] Whether to include examples in the CDK. Default: false
        `,
        type: 'array',
      });
  },
  command: 'create-cdk',
  describe: 'Create a new Octo CDK.',
  handler: async (argv: ArgumentsCamelCase<{ name: string; path: string; options?: string[] }>): Promise<void> => {
    const { name, path, options } = argv;

    // Parse options.
    const parsedOptions: {
      withExamples: boolean;
    } = { withExamples: false };
    if (options && options.length > 0) {
      for (let i = 0; i < options.length; ) {
        const optionValues = options[i].split('=');
        if (optionValues.length !== 2) {
          parsedOptions[options[i]] = options[i + 1];
          i += 2;
        } else {
          parsedOptions[optionValues[0]] = optionValues[1];
          i += 1;
        }
      }
    }

    console.log(chalk.blue(`Creating CDK...`));

    const env = createEnv();
    env.register(resolve(__dirname, 'generator-octo-cdk-template/generators/app/index.js'), {
      namespace: 'generator-octo-cdk-template:app',
    });

    try {
      await env.run(['generator-octo-cdk-template:app', name, path, String(parsedOptions.withExamples || false)], {
        skipCache: true,
        skipInstall: false,
      });

      console.log(chalk.green(`Successfully created CDK!`));
    } catch (error) {
      console.error(chalk.red(`Failed to create CDK! ${error.message}`));
      process.exit(1);
    }
  },
};
