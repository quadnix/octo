import { resolve } from 'path';
import { Container, TerraformUtility } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';

type CommitCommandArguments = {
  terraformBinary?: string;
  terragruntBinary?: string;
  terragruntDir: string;
  timeoutInMs?: number;
};

export const commitCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('terragruntDir', {
        demandOption: true,
        description: 'The generated Terragrunt directory, post apply (`terragrunt run-all apply`).',
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
  command: 'commit',
  describe: "Record the results of a Terraform apply back into Octo's state.",
  handler: async (argv: ArgumentsCamelCase<CommitCommandArguments>): Promise<void> => {
    const { terraformBinary, terragruntBinary, terragruntDir, timeoutInMs } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await bootOcto();
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

      const { warnings } = await octo.commit(app, { outputs });
      for (const warning of warnings) {
        console.error(chalk.yellow(`WARN ${warning.moduleId ? `[${warning.moduleId}] ` : ''}${warning.message}`));
      }

      console.log(chalk.green('==== Commit complete ===='));
      console.log(chalk.green('Octo state updated from the applied Terraform outputs.'));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
