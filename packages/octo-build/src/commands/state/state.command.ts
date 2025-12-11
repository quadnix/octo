import chalk from 'chalk';
import { type ArgumentsCamelCase, type Argv } from 'yargs';
import { YamlDefinitionUtility } from '../../utilities/definition/yaml/yaml-definition.utility.js';

type StateCommandArguments = {
  _: ['state', 'lock' | 'unlock' | 'get-lock'];
  definitionFilePath: string;
  lockID?: string;
};

async function handler(argv: ArgumentsCamelCase<StateCommandArguments>): Promise<void> {
  const {
    _: [, action],
    definitionFilePath,
    lockID,
  } = argv;

  try {
    const yamlDefinitionUtility = new YamlDefinitionUtility(definitionFilePath);

    const { type: stateProvider } = yamlDefinitionUtility.resolveStateProvider();

    console.log(chalk.green('Definition file is valid and state provider was successfully imported.'));

    switch (action) {
      case 'lock': {
        console.log(chalk.green('Creating a new app lock.'));

        const { lockId: newLockId } = await stateProvider.lockApp();
        console.log(`App is locked with lock ID "${newLockId}".`);

        break;
      }
      case 'unlock': {
        if (!lockID) {
          throw new Error('Lock ID is required to unlock app!');
        }

        console.log(chalk.green('Attempting to unlock app.'));

        await stateProvider.unlockApp(lockID);
        console.log(`App was unlocked using lock ID "${lockID}".`);

        break;
      }
      case 'get-lock':
      default: {
        console.log(chalk.green('Fetching existing app lock.'));

        const existingLockId = await stateProvider.getAppLock();
        if (!existingLockId) {
          console.log('App is unlocked.');
        } else {
          console.log(`App is locked with lock ID "${existingLockId}".`);
        }
      }
    }
  } catch (error: any) {
    console.log(chalk.red(error.message));
    for (const failure of error.failures || []) {
      console.log(chalk.red(failure));
    }
    process.exit(1);
  }
}

export const stateCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs
      .option('definitionFilePath', {
        alias: 'd',
        demandOption: true,
        description: 'Path to the Octo definition YAML file.',
        type: 'string',
      })
      .command({
        command: 'lock',
        describe: 'Acquire a new app state lock.',
        handler,
      })
      .command({
        command: 'unlock <lock-ID>',
        describe: 'Release the app state lock by ID.',
        handler,
      })
      .command({
        command: 'get-lock',
        describe: 'Retrieve information about the current app state lock.',
        handler,
      })
      .demandCommand(1, 'At least one action is required!')
      .strictCommands()
      .help();
  },
  command: 'state',
  describe: 'Operations on app state.',
  handler,
};
