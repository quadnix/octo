import { Container, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { bootStateProvider, reportError } from '../../utilities/octo/octo.utility.js';

type UnlockCommandArguments = {
  force?: boolean;
  lockId?: string;
};

/**
 * Releases the app lock.
 *
 * A run that finishes releases its own lock - `commit` always does, however it ends - so this is
 * either for a run that never reached its commit, or for `--force` after one died holding the lock.
 */
export const unlockCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('lockId', {
        demandOption: false,
        description: 'The lock ID to release, as printed by `octo lock`.',
        type: 'string',
      })
      .option('force', {
        default: false,
        demandOption: false,
        description: 'Release whatever lock is held, without knowing its ID. For a run that died holding one.',
        type: 'boolean',
      });
  },
  command: 'unlock',
  describe: 'Release the app state lock.',
  handler: async (argv: ArgumentsCamelCase<UnlockCommandArguments>): Promise<void> => {
    const { force, lockId } = argv;

    try {
      if (!force && !lockId) {
        throw new Error('Either --lockId or --force is required to unlock!');
      }

      await bootStateProvider();
      const stateManagementService = await Container.getInstance().get(StateManagementService);

      // Force reads the held lock and releases that, which is the only way through when the ID was
      // lost with the run that took it.
      const existingLockId = await stateManagementService.getAppLock();
      if (!existingLockId) {
        console.error(chalk.green('App is already unlocked.'));
        return;
      }

      await stateManagementService.unlockApp(force ? existingLockId : lockId!);
      console.error(chalk.green(`App was unlocked, releasing lock ID "${existingLockId}".`));
    } catch (error) {
      reportError(error);
      process.exit(1);
    }
  },
};
