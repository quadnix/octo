import { resolve } from 'path';
import { Container, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { reportError } from '../../utilities/octo/octo.utility.js';

type ApplyCommandArguments = {
  autoApprove?: boolean;
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

/**
 * Plans the directory and prints anything the apply would destroy.
 *
 * Returns true when the apply must not proceed: something would be destroyed, or a folder would not
 * plan and so nothing can be said about what it would destroy.
 */
async function isBlockedByDestroys(terraformUtility: TerraformUtility, resolvedDir: string): Promise<boolean> {
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

  console.error(chalk.red('This apply would DESTROY:'));

  for (const destroy of destroys.sort((a, b) => a.address.localeCompare(b.address))) {
    console.error(chalk.red(`  [${destroy.moduleId}] ${destroy.address} (${destroy.tfActions.join(', ')})`));
  }

  console.error(
    chalk.red(
      '\nRefusing to apply. Run "octo validate" to see why each of these is being destroyed, ' +
        'then re-run with --auto-approve to proceed.',
    ),
  );

  return true;
}

export const applyCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory to apply.',
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
  // Apply is a terraform action, not an octo mode — it does not boot octo or read octo state. It is
  // additive to shelling `terragrunt run --all apply` directly, and completes the CLI's 1:1 coverage
  // of TerraformUtility's methods (generate/validate/commit + apply).
  describe: 'Apply the generated Terraform in the Terragrunt directory.',
  handler: async (argv: ArgumentsCamelCase<ApplyCommandArguments>): Promise<void> => {
    const { autoApprove, terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      // The underlying apply runs `-auto-approve` and validate is optional, so without an explicit
      // opt-in, plan first and refuse to destroy anything the user has not been shown. What is at
      // stake is the data inside a resource terraform recreates; octo's own state stays consistent
      // either way.
      if (!autoApprove && (await isBlockedByDestroys(terraformUtility, resolvedDir))) {
        process.exit(1);
      } else {
        const result = await terraformUtility.apply(resolvedDir);
        if (result.stdout) {
          console.log(result.stdout);
        }

        console.log(chalk.green('==== Apply complete ===='));
      }
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
