import { resolve } from 'path';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootOcto, reportError } from '../../utilities/octo/octo.utility.js';

type CommitCommandArguments = {
  terragruntDir: string;
};

export const commitCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('terragruntDir', {
      demandOption: true,
      description: 'The generated Terragrunt directory, with a tfstate present in each module folder.',
      type: 'string',
    });
  },
  command: 'commit',
  describe: "Record the results of a Terraform apply back into Octo's state.",
  handler: async (argv: ArgumentsCamelCase<CommitCommandArguments>): Promise<void> => {
    const { terragruntDir } = argv;

    try {
      const { app, octo } = await bootOcto();

      await octo.commit(app, { tfDir: resolve(process.cwd(), terragruntDir) });

      console.log(chalk.green('==== Commit complete ===='));
      console.log(chalk.green('Octo state updated from the applied Terraform outputs.'));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
