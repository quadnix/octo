import { resolve } from 'path';
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

      // Nothing is printed here. The listeners report what was written and that the mode finished,
      // and they are the only writer on stdout - a `console.log` alongside them lands out of order,
      // because pino's stream and this one flush independently. Failures still reach stderr via
      // `reportError`, so a silent run is a successful one.
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
