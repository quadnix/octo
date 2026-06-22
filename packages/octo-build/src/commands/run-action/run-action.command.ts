import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';

type RunActionCommandArguments = {
  input?: string[];
  resourceId: string;
};

export const runActionCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('resourceId', {
        demandOption: true,
        description: 'The id of the resource whose action should run.',
        type: 'string',
      })
      .option('input', {
        array: true,
        default: [],
        description: 'Parent response input, as <parentResourceId>.<responseKey>=<value>. Repeatable.',
        type: 'string',
      });
  },
  command: 'run-action',
  describe: 'Run a single resource action. Invoked by Terraform mid-apply for an external resource.',
  handler: async (argv: ArgumentsCamelCase<RunActionCommandArguments>): Promise<void> => {
    const { input, resourceId } = argv;

    try {
      const inputs: Record<string, string> = {};
      for (const entry of input ?? []) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex < 0) {
          throw new Error(`Invalid --input "${entry}"! Expected <parentResourceId>.<responseKey>=<value>.`);
        }
        inputs[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
      }

      // stdout carries ONLY the response JSON (terraform's `data "external"` consumes it), so suppress
      // boot output and route this command's own diagnostics to stderr.
      const { app, octo } = await bootOcto({ noConsole: true });

      const result = await octo.runAction(app, {
        inputs,
        resourceId,
      });

      // stdout carries ONLY the response JSON — terraform's `data "external"` consumes it.
      process.stdout.write(JSON.stringify(result.response));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
