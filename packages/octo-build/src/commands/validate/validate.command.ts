import { resolve } from 'path';
import { Container, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';

type ValidateCommandArguments = {
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

/**
 * Step 2 of the octo lifecycle. See {@link Octo.validate}.
 */
export const validateCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory to plan and validate.',
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
  command: 'validate',
  describe: "Step 2: validate the generated Terraform plans against Octo's resource diff.",
  handler: async (argv: ArgumentsCamelCase<ValidateCommandArguments>): Promise<void> => {
    const { terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await bootOcto();
      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      // A folder whose plan cannot be read is carried as an error rather than aborting the run. Octo
      // reports the failure for a folder holding a module it tracks, and ignores one it does not know.
      const planResult = await terraformUtility.plan(resolvedDir, { json: true });

      // The report itself is rendered by whichever listeners the definition registers — none of
      // them, and this command prints only its verdict. What survives here is the exit code, which
      // is the CLI's own job and not a listener's.
      const report = await octo.validate(app, planResult);

      // Only being unable to read a folder is unsuccessful. Drift and unexplained changes are
      // findings to act on, not exit codes.
      //
      // The verdict itself is not printed here - the listeners render the report, drift included,
      // on stdout, and a `console.log` alongside pino lands out of order. What is left is the exit
      // code, which is the CLI's own job, and the failure line on stderr.
      if (report.failures.length > 0) {
        console.error(chalk.red('\nValidation could not complete!'));
        process.exit(1);
      }
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
