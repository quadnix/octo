import { Container, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { OctoUtility } from '../../utilities/octo/octo.utility.js';

type UnlockCommandArguments = {
  lockId: string;
};

/**
 * Finishes a run as it stands and releases its lock.
 *
 * A successful `commit` releases its own lock, so this is for a run that will not reach one - a run
 * that never applied, or one somebody finished by hand. With a remote state provider, releasing
 * seals what the run wrote.
 */
export const unlockCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('lockId', {
      demandOption: true,
      description: 'The lock ID to release, as printed by `octo lock`.',
      type: 'string',
    });
  },
  command: 'unlock',
  describe: 'Finish a run as it stands, releasing its app state lock.',
  handler: async (argv: ArgumentsCamelCase<UnlockCommandArguments>): Promise<void> => {
    const { lockId } = argv;

    await OctoUtility.runCommand('unlock', async () => {
      await OctoUtility.bootStateProvider();
      const stateManagementService = await Container.getInstance().get(StateManagementService);

      if (!(await stateManagementService.getAppLock())) {
        console.error(chalk.green('App is already unlocked.'));
        return;
      }

      await stateManagementService.unlockApp(lockId);
      console.error(chalk.green(`App was unlocked, releasing lock ID "${lockId}".`));
    });
  },
};
