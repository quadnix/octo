import { type App, Octo } from '@quadnix/octo';
import chalk from 'chalk';
import type { ArgumentsCamelCase, Argv } from 'yargs';
import { YamlDefinitionUtility } from '../../utilities/definition/yaml/yaml-definition.utility.js';

type RunCommandArguments = {
  definitionFilePath: string;
};

export const runCommand = {
  builder: (yargs: Argv): Argv => {
    return yargs.option('definitionFilePath', {
      alias: 'd',
      demandOption: true,
      description: 'Path to the Octo definition YAML file.',
      type: 'string',
    });
  },
  command: 'run',
  describe: 'Validate and run the Octo definition file.',
  handler: async (argv: ArgumentsCamelCase<RunCommandArguments>): Promise<void> => {
    let { definitionFilePath } = argv;

    try {
      const yamlDefinitionUtility = new YamlDefinitionUtility(definitionFilePath);

      const hooks = await yamlDefinitionUtility.resolveHooks();
      const imports = await yamlDefinitionUtility.resolveImports();
      const listeners = await yamlDefinitionUtility.resolveListeners();
      const modules = yamlDefinitionUtility.resolveModules(imports);
      const stateProvider = yamlDefinitionUtility.resolveStateProvider();
      const transactionOptions = yamlDefinitionUtility.resolveTransactionOptions();

      console.log(chalk.green('Definition file is valid and all modules were successfully imported.'));

      // Initialize.
      const octo = new Octo();
      await octo.initialize(
        stateProvider.type,
        listeners!.map((l) => ({
          options: {
            args: l.args,
            metadata: l.metadata,
          },
          type: l.type,
        })),
      );

      // Register hooks.
      octo.registerHooks(hooks);

      // Load modules.
      for (const moduleDefinition of modules) {
        octo.loadModule(moduleDefinition.moduleClass, moduleDefinition.moduleId, moduleDefinition.moduleInputs);
      }
      octo.orderModules(modules.map((m) => m.moduleClass));

      // Compose.
      const appModuleId = modules[0].moduleId;
      const initializedModules = await octo.compose();
      const app = initializedModules[`${appModuleId}.model.app`] as App;

      // Start transaction.
      const transaction = octo.beginTransaction(app, transactionOptions);
      if (transactionOptions.yieldModelDiffs) {
        const result = await transaction.next();
        console.log(chalk.green('==== Model Diffs ===='));
        console.log(JSON.stringify(result.value, null, 2));
      }
      if (transactionOptions.yieldModelTransaction) {
        const result = await transaction.next();
        console.log(chalk.green('==== Model Transaction ===='));
        console.log(JSON.stringify(result.value, null, 2));
      }
      if (transactionOptions.yieldResourceDiffs) {
        const result = await transaction.next();
        console.log(chalk.green('==== Resource Diffs ===='));
        console.log(JSON.stringify(result.value, null, 2));
      }
      if (transactionOptions.yieldResourceTransaction) {
        const result = await transaction.next();
        console.log(chalk.green('==== Resource Transaction ===='));
        console.log(JSON.stringify(result.value, null, 2));
      }

      const result = await transaction.next();
      if (!transactionOptions.yieldResourceTransaction) {
        console.log(chalk.green('==== Resource Transaction ===='));
        console.log(JSON.stringify(result.value, null, 2));
      }
    } catch (error: any) {
      // Print errors.
      console.log(chalk.red(error.stack));
      for (const errorProperty of Object.getOwnPropertyNames(error) || []) {
        if (errorProperty !== 'message' && errorProperty !== 'stack') {
          console.log(chalk.red(`${errorProperty}: ${error[errorProperty]}`));
        }
      }

      // Print YAML failures.
      const failures: string[] = error.failures || [];
      if (failures.length > 0) {
        console.log('\n');
        console.log(chalk.red('FAILURES'));
        console.log(chalk.red('========'));
      }
      for (let i = 0; i < failures.length; i++) {
        console.log(chalk.red(`${i + 1}. ${failures[i]}`));
      }

      process.exit(1);
    }
  },
};
