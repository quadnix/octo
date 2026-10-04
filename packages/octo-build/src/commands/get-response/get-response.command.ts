import { Container, StateManagementService } from '@quadnix/octo';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

type GetResponseCommandArguments = {
  resourceId: string;
};

/**
 * Prints a resource's recorded response as JSON.
 *
 * Terraform's `data "external"` runs this on every plan and every apply of a folder holding an
 * external resource; it is not a step you run yourself. It reads octo state and nothing else - no
 * modules are composed and no cloud is called, so it is safe at plan time and costs one file read.
 */
export const getResponseCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('resourceId', {
      demandOption: true,
      description: 'The id of the resource whose response should be printed.',
      type: 'string',
    });
  },
  command: 'get-response',
  describe: "Print a resource's recorded response. Invoked by Terraform for an external resource.",
  handler: async (argv: ArgumentsCamelCase<GetResponseCommandArguments>): Promise<void> => {
    const { resourceId } = argv;

    try {
      await OctoUtility.bootStateProvider();
      const stateManagementService = await Container.getInstance().get(StateManagementService);

      const response = await stateManagementService.getResourceResponse(resourceId);
      if (!response) {
        throw new Error(
          `No response recorded for resource "${resourceId}"! ` +
            'Octo records one when the resource is applied, and commits it with the rest of the run.',
        );
      }

      // stdout carries ONLY the response JSON - terraform's `data "external"` consumes it.
      process.stdout.write(JSON.stringify(response));
    } catch (error) {
      OctoUtility.reportError(error);
      process.exit(1);
    }
  },
};
