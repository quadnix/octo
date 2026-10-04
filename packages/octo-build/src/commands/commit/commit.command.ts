import { resolve } from 'path';
import { Container, StateManagementService, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

type CommitCommandArguments = {
  lockId: string;
  partial?: boolean;
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

/**
 * Step 4 of the octo lifecycle. See `Octo.commit()`.
 *
 * This is the command that ends a run, so a commit that succeeds releases the app lock. One that
 * fails keeps it, and is run again with the same lock ID. Octo never unlocks on its own; the lock is
 * the CLI's to take and to drop.
 */
export const commitCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory, post apply (`terragrunt run --all -- apply`).',
        type: 'string',
      })
      .option('lockId', {
        demandOption: true,
        description: 'The app lock ID from `octo lock`. Released when the commit succeeds.',
        type: 'string',
      })
      .option('partial', {
        default: false,
        demandOption: false,
        description: 'Record what did apply, leaving resources with missing outputs uncommitted. For a failed apply.',
        type: 'boolean',
      })
      .option('terraformBinary', {
        demandOption: false,
        description: 'Override the terraform/tofu binary terragrunt should invoke (sets TG_TF_PATH).',
        type: 'string',
      })
      .option('terragruntBinary', {
        demandOption: false,
        description: 'Override the terragrunt binary/path to invoke.',
        type: 'string',
      })
      .option('timeoutInMs', {
        demandOption: false,
        description: 'Override the per-command timeout, in milliseconds.',
        type: 'number',
      });
  },
  command: 'commit',
  describe: "Step 4: record the results of a Terraform apply back into Octo's state.",
  handler: async (argv: ArgumentsCamelCase<CommitCommandArguments>): Promise<void> => {
    const { lockId, partial, terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await OctoUtility.bootOcto();
      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      // Read outputs from every folder terragrunt discovers. A folder whose outputs cannot be read
      // is warned and omitted rather than aborting the commit: octo rejects the commit itself if
      // that folder held a module it tracks, and merely warns if it is a folder octo does not know.
      const [outputs, moduleIds] = await Promise.all([
        terraformUtility.output(resolvedDir, { json: true }),
        terraformUtility.listModuleFolders(resolvedDir),
      ]);
      for (const moduleId of moduleIds) {
        if (!outputs.has(moduleId)) {
          console.error(chalk.yellow(`WARN [${moduleId}] Could not read terraform outputs`));
        }
      }

      const { warnings } = await octo.commit(app, { lockId, outputs, partial });
      for (const warning of warnings) {
        console.error(chalk.yellow(`WARN ${warning.moduleId ? `[${warning.moduleId}] ` : ''}${warning.message}`));
      }

      // Release the lock once the run is recorded. A failed commit keeps it for the re-run.
      const stateManagementService = await Container.getInstance().get(StateManagementService);
      await stateManagementService.unlockApp(lockId);

      // No verdict printed here - the listeners own stdout and render the commit report there.
      // The warnings above stay, on stderr: a different fd, so they cannot interleave with pino.
    } catch (error) {
      OctoUtility.reportError(error);
      process.exit(1);
    }
  },
};
