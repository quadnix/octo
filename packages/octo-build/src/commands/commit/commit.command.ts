import { resolve } from 'path';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';
import { type TerraformOutputs, TerragruntUtility } from '../../utilities/terragrunt/terragrunt.utility.js';

type CommitCommandArguments = {
  terragruntDir: string;
};

export const commitCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('terragruntDir', {
      demandOption: true,
      description: 'The generated Terragrunt directory, post apply (`terragrunt run-all apply`).',
      type: 'string',
    });
  },
  command: 'commit',
  describe: "Record the results of a Terraform apply back into Octo's state.",
  handler: async (argv: ArgumentsCamelCase<CommitCommandArguments>): Promise<void> => {
    const { terragruntDir } = argv;
    const resolvedDir = resolve(process.cwd(), terragruntDir);

    try {
      const { app, octo } = await bootOcto();

      // Read outputs from every folder terragrunt discovers. A folder whose outputs cannot be read
      // is warned and omitted rather than aborting the commit: octo rejects the commit itself if
      // that folder held a module it tracks, and merely warns if it is a folder octo does not know.
      const outputs = new Map<string, TerraformOutputs>();
      const moduleIds = await TerragruntUtility.listModuleFolders(resolvedDir);
      for (const moduleId of moduleIds) {
        try {
          outputs.set(moduleId, await TerragruntUtility.readOutputs(resolve(resolvedDir, moduleId)));
        } catch (error) {
          console.error(chalk.yellow(`WARN [${moduleId}] Could not read terraform outputs: ${error.message}`));
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
