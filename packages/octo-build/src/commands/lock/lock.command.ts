import { Container, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootStateProvider, reportError } from '../../utilities/octo/octo.utility.js';

type LockCommandArguments = {
  lockId?: string;
};

/**
 * Takes the app lock, which `apply` and `commit` both require. With `--lockId`, resumes the run
 * already holding that lock, which is how a run that died is finished.
 *
 * The lock id is the only thing printed on stdout, so a shell can capture it:
 * `LOCK_ID=$(octo lock)`. Everything else goes to stderr.
 */
export const lockCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('lockId', {
      demandOption: false,
      description: 'Resume the run holding this lock ID instead of taking a new lock. Stop that run first.',
      type: 'string',
    });
  },
  command: 'lock',
  describe: 'Take the app state lock, printing its ID. Required before apply and commit.',
  handler: async (argv: ArgumentsCamelCase<LockCommandArguments>): Promise<void> => {
    try {
      await bootStateProvider();
      const stateManagementService = await Container.getInstance().get(StateManagementService);

      const { lockId } = await stateManagementService.lockApp(argv.lockId);

      console.error(chalk.green(argv.lockId ? 'App lock is resumed.' : 'App is locked.'));
      console.log(lockId);
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
