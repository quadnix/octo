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
  describe: "Validate the generated Terraform plans against Octo's resource diff.",
  handler: async (argv: ArgumentsCamelCase<ValidateCommandArguments>): Promise<void> => {
    const { terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await bootOcto();
      const terraformUtility = await Container.getInstance().get<TerraformUtility, any>(TerraformUtility, {
        args: [{ terraformBinary, terragruntBinary, timeoutInMs }, true],
      });

      // A folder whose plan cannot be read is warned and omitted rather than aborting validation:
      // octo rejects the validation itself if that folder held a module it tracks, and merely warns
      // if it is a folder octo does not know.
      const [plans, moduleIds] = await Promise.all([
        terraformUtility.plan(resolvedDir, { json: true }),
        terraformUtility.listModuleFolders(resolvedDir),
      ]);
      for (const moduleId of moduleIds) {
        if (!plans.has(moduleId)) {
          console.error(chalk.yellow(`WARN [${moduleId}] Could not read terraform plan`));
        }
      }

      const result = await octo.validate(app, { plans });

      for (const warning of result.warnings) {
        console.error(chalk.yellow(`WARN ${warning.moduleId ? `[${warning.moduleId}] ` : ''}${warning.message}`));
      }
      for (const error of result.errors) {
        console.error(chalk.red(`ERROR ${error.moduleId ? `[${error.moduleId}] ` : ''}${error.message}`));
      }

      if (result.pass) {
        console.log(chalk.green('Validation PASSED.'));
      } else {
        console.error(chalk.red('Validation FAILED!'));
        process.exit(1);
      }
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
