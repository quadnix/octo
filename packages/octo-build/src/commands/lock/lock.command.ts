import { AppLockError, Container, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

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
    await OctoUtility.runCommand(
      'lock',
      async () => {
        await OctoUtility.bootStateProvider();
        const stateManagementService = await Container.getInstance().get(StateManagementService);

        const { lockId } = await stateManagementService.lockApp(argv.lockId);

        console.error(chalk.green(argv.lockId ? 'App lock is resumed.' : 'App is locked.'));
        console.log(lockId);
      },
      // A held lock is either a run still working or one that died, which only its lock can finish.
      (error) =>
        error instanceof AppLockError && error.reason === 'held' && error.holder
          ? 'If the run holding it is still working, wait for it. If it died, finish it with its lock: run ' +
            `"octo lock --lockId ${error.holder.lockId}", then generate, apply and commit with that lock ID.`
          : undefined,
    );
  },
};
