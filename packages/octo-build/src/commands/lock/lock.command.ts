import { Container, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import type { Argv } from 'yargs';
import { bootStateProvider, reportError } from '../../utilities/octo/octo.utility.js';

/**
 * Takes the app lock, which `apply` and `commit` both require.
 *
 * The lock id is the only thing printed on stdout, so a shell can capture it:
 * `LOCK_ID=$(octo lock)`. Everything else goes to stderr.
 */
export const lockCommand = {
  builder: (yargs: Argv): Argv => yargs,
  command: 'lock',
  describe: 'Take the app state lock, printing its ID. Required before apply and commit.',
  handler: async (): Promise<void> => {
    try {
      await bootStateProvider();
      const stateManagementService = await Container.getInstance().get(StateManagementService);

      const { lockId } = await stateManagementService.lockApp();

      console.error(chalk.green('App is locked.'));
      console.log(lockId);
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
