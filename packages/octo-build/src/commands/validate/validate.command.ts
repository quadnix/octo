import { resolve } from 'path';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';
import { type TerraformPlan, TerragruntUtility } from '../../utilities/terragrunt/terragrunt.utility.js';

type ValidateCommandArguments = {
  terragruntDir: string;
};

export const validateCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('terragruntDir', {
      demandOption: true,
      description: 'The generated Terragrunt directory to plan and validate.',
      type: 'string',
    });
  },
  command: 'validate',
  describe: "Validate the generated Terraform plans against Octo's resource diff.",
  handler: async (argv: ArgumentsCamelCase<ValidateCommandArguments>): Promise<void> => {
    const { terragruntDir } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await bootOcto();

      const plans = new Map<string, TerraformPlan>();
      const moduleIds = await TerragruntUtility.listModuleFolders(resolvedDir);
      for (const moduleId of moduleIds) {
        plans.set(moduleId, await TerragruntUtility.readPlan(resolve(resolvedDir, moduleId)));
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
