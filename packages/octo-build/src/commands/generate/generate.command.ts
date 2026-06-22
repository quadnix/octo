import { resolve } from 'path';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';

type GenerateCommandArguments = {
  outputDir: string;
};

export const generateCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('outputDir', {
      alias: 'o',
      demandOption: true,
      description: 'Directory to write the generated Terragrunt module folders into (wiped on every run).',
      type: 'string',
    });
  },
  command: 'generate',
  describe: 'Generate Terragrunt module folders representing the full desired infrastructure.',
  handler: async (argv: ArgumentsCamelCase<GenerateCommandArguments>): Promise<void> => {
    const { outputDir } = argv;

    try {
      const { app, octo } = await bootOcto();

      const resolvedOutputDir = resolve(process.cwd(), outputDir);
      await octo.generate(app, { outputDir: resolvedOutputDir });

      console.log(chalk.green('==== Generate complete ===='));
      console.log(chalk.green(`Wrote Terragrunt module folders to "${resolvedOutputDir}".`));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
