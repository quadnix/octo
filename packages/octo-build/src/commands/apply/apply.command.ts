import { resolve } from 'path';
import { Container, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { reportError } from '../../utilities/octo/octo.utility.js';

type ApplyCommandArguments = {
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

export const applyCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory to apply.',
        type: 'string',
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
    const { terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      const result = await terraformUtility.apply(resolvedDir);
      if (result.stdout) {
        console.log(result.stdout);
      }

      console.log(chalk.green('==== Apply complete ===='));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
