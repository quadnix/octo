import { resolve } from 'path';
import { Container, StateManagementService, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

type ApplyCommandArguments = {
  autoApprove?: boolean;
  lockId: string;
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

/**
 * Plans the directory and prints anything the apply would destroy, marking each destroy of a resource
 * the last commit recorded as losing data.
 *
 * Returns true when the apply must not proceed: something would be destroyed, or a folder would not
 * plan and so nothing can be said about what it would destroy.
 */
async function isBlockedByDestroys(
  terraformUtility: TerraformUtility,
  stateManagementService: StateManagementService,
  resolvedDir: string,
): Promise<boolean> {
  const { errors, plans } = await terraformUtility.plan(resolvedDir, { json: true });

  if (errors.size > 0) {
    for (const [moduleId, error] of errors.entries()) {
      console.error(chalk.red(`ERROR [${moduleId}] Terraform failed to plan:\n${error}`));
    }

    console.error(
      chalk.red(
        '\nCannot check this apply for destroys because the folders above would not plan. ' +
          'Fix them, or pass --auto-approve to apply anyway.',
      ),
    );

    return true;
  }

  const destroys = terraformUtility.findPlannedDestroys(plans);
  if (destroys.length === 0) {
    return false;
  }

  // Find the addresses whose destroy loses data.
  const { userData } = await stateManagementService.getResourceState(
    stateManagementService.actualResourceStateFileName,
  );
  const dataLossAddresses = new Set(
    (userData.terraformResources ?? [])
      .filter((mapping) => mapping.destroyLosesData)
      .flatMap((mapping) => mapping.terraformAddresses.map((address) => `${mapping.moduleId} ${address}`)),
  );

  console.error(chalk.red('This apply would DESTROY:'));

  for (const destroy of destroys.sort((a, b) => a.address.localeCompare(b.address))) {
    const dataLoss = dataLossAddresses.has(`${destroy.moduleId} ${destroy.address}`)
      ? ' - the data it holds is lost with it'
      : '';
    console.error(chalk.red(`  [${destroy.moduleId}] ${destroy.address} (${destroy.tfActions.join(', ')})${dataLoss}`));
  }

  console.error(
    chalk.red(
      '\nRefusing to apply. Run "octo validate" to see why each of these is being destroyed, ' +
        'then re-run with --auto-approve to proceed.',
    ),
  );

  return true;
}

/**
 * Step 3 of the octo lifecycle, and the only one that changes live infrastructure.
 *
 * Unlike generate and validate, this is a terraform action rather than an octo mode - it composes no
 * model graph and reads no model or resource state. What it does need is the state provider, both
 * because terraform's own state is checked out of it before every terraform command and back in
 * after, and because this is one of the two commands that require the app lock. It refuses to run
 * when the plan would destroy anything, unless `--auto-approve` is passed.
 */
export const applyCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory to apply.',
        type: 'string',
      })
      .option('lockId', {
        demandOption: true,
        description: 'The app lock ID from `octo lock`. Applying without the lock is refused.',
        type: 'string',
      })
      .option('autoApprove', {
        default: false,
        demandOption: false,
        description: 'Apply without first checking the plan for destroys. Required to destroy anything.',
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
  command: 'apply',
  describe: 'Step 3: apply the generated Terraform in the Terragrunt directory.',
  handler: async (argv: ArgumentsCamelCase<ApplyCommandArguments>): Promise<void> => {
    const { autoApprove, lockId, terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    OctoUtility.prepareCallbackEnvironment();

    await OctoUtility.runCommand('apply', async () => {
      const { stateCheckInIntervalInMs } = await OctoUtility.bootStateProvider();

      // The lock is verified before anything is planned, so a run without it fails having done
      // nothing. It is released by `octo commit`, not here - the apply is the middle of a run.
      const stateManagementService = await Container.getInstance().get(StateManagementService);
      if (!(await stateManagementService.isAppLocked(lockId))) {
        throw new Error('App is not locked! Run "octo lock" first.');
      }

      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ stateCheckInIntervalInMs, terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      // The underlying apply runs `-auto-approve` and validate is optional, so without an explicit
      // opt-in, plan first and refuse to destroy anything the user has not been shown. What is at
      // stake is the data inside a resource terraform recreates; octo's own state stays consistent
      // either way.
      if (!autoApprove && (await isBlockedByDestroys(terraformUtility, stateManagementService, resolvedDir))) {
        return 1;
      } else {
        // Terragrunt's output goes out as events as it is written, which the listeners print and record.
        try {
          await terraformUtility.apply(resolvedDir);
        } catch (error) {
          // An apply that got this far may have built some of what was asked for, and only a commit
          // records that. The rule belongs here rather than in every pipeline that calls this: the
          // apply is what knows it failed, and it is the one step after which the choice is not
          // obvious.
          console.error(
            chalk.red(
              `\nThis apply may have built part of what you asked for. Run "octo commit --partial ` +
                `--terragruntDir ${terragruntDir} --lockId ${lockId}" to record that and release the lock, then fix ` +
                'what failed and run again.',
            ),
          );
          throw error;
        }
      }
    });
  },
};
