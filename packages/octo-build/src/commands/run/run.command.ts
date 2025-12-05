import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { type Constructable, LocalStateProvider, TestStateProvider } from '@quadnix/octo';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import chalk from 'chalk';
import { load } from 'js-yaml';
import type { ArgumentsCamelCase, Argv } from 'yargs';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface IRunDefinition {
  modules: Array<{
    moduleClass: string;
    moduleId: string;
    moduleImportPath: string;
    moduleInputs: Record<string, unknown>;
  }>;
  settings: {
    listeners?: (
      | { type: Constructable<HtmlReportEventListener> | 'HtmlReportEventListener' }
      | { type: Constructable<LoggingEventListener> | 'LoggingEventListener' }
    )[];
    stateProvider:
      | { statePath: string; type: Constructable<LocalStateProvider> | 'LocalStateProvider' }
      | { type: Constructable<TestStateProvider> | 'TestStateProvider' };
    transactionOptions?: {
      enableResourceCapture?: boolean;
      enableResourceValidation?: boolean;
      yieldModelDiffs?: boolean;
      yieldModelTransaction?: boolean;
      yieldResourceDiffs?: boolean;
      yieldResourceTransaction?: boolean;
    };
  };
  version: number;
}

type RunCommandArguments = {
  definitionFilePath: string;
};

// TODO: add support for env.
function applyEnvOverrides(definition: IRunDefinition): void {
  if (!definition.settings.listeners) {
    definition.settings.listeners = [];
  } else {
    for (const listener of definition.settings.listeners) {
      if (listener.type === 'HtmlReportEventListener') {
        listener.type = HtmlReportEventListener;
      } else if (listener.type === 'LoggingEventListener') {
        listener.type = LoggingEventListener;
      }
    }
  }
  // TODO: users can pass several other options to control listeners.
  // Based on their options, we can manipulate listeners further,
  // like excluding a certain listener from loading, or passing different arguments.

  if (definition.settings.stateProvider.type === 'LocalStateProvider') {
    definition.settings.stateProvider.type = LocalStateProvider;
  } else if (definition.settings.stateProvider.type === 'TestStateProvider') {
    definition.settings.stateProvider.type = TestStateProvider;
  }

  if (!definition.settings.transactionOptions) {
    definition.settings.transactionOptions = {
      enableResourceCapture: false,
      enableResourceValidation: false,
      yieldModelDiffs: false,
      yieldModelTransaction: false,
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    };
  }
  const tx = definition.settings.transactionOptions;
  if (process.env.OCTO_ENABLE_RESOURCE_CAPTURE) {
    tx.enableResourceCapture = process.env.OCTO_ENABLE_RESOURCE_CAPTURE.toLowerCase() === 'true';
  }
  if (process.env.OCTO_ENABLE_RESOURCE_VALIDATION) {
    tx.enableResourceValidation = process.env.OCTO_ENABLE_RESOURCE_VALIDATION.toLowerCase() === 'true';
  }
  if (process.env.OCTO_YIELD_MODEL_DIFFS) {
    tx.yieldModelDiffs = process.env.OCTO_YIELD_MODEL_DIFFS.toLowerCase() === 'true';
  }
  if (process.env.OCTO_YIELD_MODEL_TRANSACTION) {
    tx.yieldModelTransaction = process.env.OCTO_YIELD_MODEL_TRANSACTION.toLowerCase() === 'true';
  }
  if (process.env.OCTO_YIELD_RESOURCE_DIFFS) {
    tx.yieldResourceDiffs = process.env.OCTO_YIELD_RESOURCE_DIFFS.toLowerCase() === 'true';
  }
  if (process.env.OCTO_YIELD_RESOURCE_TRANSACTION) {
    tx.yieldResourceTransaction = process.env.OCTO_YIELD_RESOURCE_TRANSACTION.toLowerCase() === 'true';
  }

  if (!definition.version) {
    definition.version = 1;
  } else {
    definition.version = Number(definition.version);
  }
}

async function importModules(definition: IRunDefinition): Promise<void> {
  if (!definition.modules || definition.modules.length === 0) {
    console.log(chalk.red('At least 1 module is required to run!'));
    process.exit(1);
  }

  for (const moduleDef of definition.modules) {
    const { moduleImportPath, moduleClass, moduleId } = moduleDef;
    if (!moduleImportPath || !moduleClass) {
      console.log(
        chalk.red(
          `Invalid module definition for moduleId="${moduleId}": "moduleImportPath" and "moduleClass" are required!`,
        ),
      );
      process.exit(1);
    }

    const resolvedImport =
      moduleImportPath.startsWith('.') || moduleImportPath.startsWith('/')
        ? resolve(process.cwd(), moduleImportPath)
        : moduleImportPath;

    try {
      const imported = await import(resolvedImport);
      if (!imported[moduleClass]) {
        console.log(
          chalk.red(`Unable to find export "${moduleClass}" in module "${resolvedImport}" for moduleId="${moduleId}"!`),
        );
        process.exit(1);
      }
    } catch (error: any) {
      console.log(
        chalk.red(
          `Failed to import module "${resolvedImport}" for moduleId="${moduleId}": ${error?.message || String(error)}`,
        ),
      );
      process.exit(1);
    }
  }
}

function validateDefinition(definition: IRunDefinition): void {
  const schemaPath = definition.version === 1 ? resolve(__dirname, 'octo-v1.schema.json') : undefined;
  if (!schemaPath) {
    console.log(chalk.red(`Could not find schema for version "${definition.version}"!`));
    process.exit(1);
  }

  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  const valid = validate(definition);
  if (!valid) {
    console.log(chalk.red('Definition file failed validation against schema!'));
    for (const err of validate.errors || []) {
      console.log(chalk.red(`  [${err.instancePath || '/'}] ${err.message}`));
    }
    process.exit(1);
  }
}

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
    definitionFilePath = resolve(process.cwd(), definitionFilePath);

    if (!existsSync(definitionFilePath)) {
      console.log(chalk.red('Cannot find definition file: ' + definitionFilePath));
      process.exit(1);
    }

    let definition: IRunDefinition;
    try {
      const content = readFileSync(definitionFilePath, 'utf-8');
      definition = (load(content) || {}) as IRunDefinition;
    } catch (error: any) {
      console.log(chalk.red('Unable to parse definition file: ' + error?.message));
      throw error;
    }

    validateDefinition(definition);
    applyEnvOverrides(definition);
    await importModules(definition);

    console.log(chalk.green('Definition file is valid and all modules were successfully imported.'));
  },
};
