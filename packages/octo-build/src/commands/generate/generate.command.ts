import { resolve } from 'path';
import { Container, StateManagementService } from '@quadnix/octo';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

type GenerateCommandArguments = {
  outputDir: string;
};

/**
 * Step 1 of the octo lifecycle. See {@link Octo.generate}.
 *
 * The state is refreshed before octo boots, because booting is what reads it.
 */
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
  describe: 'Step 1: generate Terragrunt module folders representing the full desired infrastructure.',
  handler: async (argv: ArgumentsCamelCase<GenerateCommandArguments>): Promise<void> => {
    const { outputDir } = argv;

    try {
      await OctoUtility.bootStateProvider();
      await (await Container.getInstance().get(StateManagementService)).refreshState();

      const { app, octo } = await OctoUtility.bootOcto();

      const resolvedOutputDir = resolve(process.cwd(), outputDir);
      await octo.generate(app, { outputDir: resolvedOutputDir });

      // Nothing is printed here. The listeners report what was written and that the mode finished,
      // and they are the only writer on stdout - a `console.log` alongside them lands out of order,
      // because pino's stream and this one flush independently. Failures still reach stderr via
      // `reportError`, so a silent run is a successful one.
    } catch (error) {
      OctoUtility.reportError(error);
      process.exit(1);
    }
  },
};
