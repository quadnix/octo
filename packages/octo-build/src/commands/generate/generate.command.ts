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
      description:
        'Directory to write the generated Terragrunt module folders into. Folders are overwritten in place, never ' +
        'wiped; a deleted module leaves an emptied folder so a later apply destroys its resources.',
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

      // What was written is reported by the listeners, from `TerraformFoldersWrittenEvent` - it
      // carries the folder count and the emptied ones too. Only the verdict is this command's.
      console.log(chalk.green('==== Generate complete ===='));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
