import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  type App,
  type Constructable,
  type IStateProvider,
  LocalStateProvider,
  Octo,
  TestStateProvider,
} from '@quadnix/octo';
import type { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import type { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import chalk from 'chalk';
import { load } from 'js-yaml';
import type { ArgumentsCamelCase, Argv } from 'yargs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const customEnvironmentVariables: Record<string, unknown> = {};

type RunCommandArguments = {
  definitionFilePath: string;
};

type HookMethodSignature = () => {
  postCommitHooks?: { handle: any }[];
  postModelActionHooks?: { action: any; handle: any }[];
  postResourceActionHooks?: { action: any; handle: any }[];
  preCommitHooks?: { handle: any }[];
  preModelActionHooks?: { action: any; handle: any }[];
  preResourceActionHooks?: { action: any; handle: any }[];
};

type HtmlReportEventListenerOptions = {
  args?: unknown[];
  metadata?: Record<string, string>;
  type: Constructable<HtmlReportEventListener> | 'HtmlReportEventListener';
};
type LoggingEventListenerOptions = {
  args?: unknown[];
  metadata?: Record<string, string>;
  type: Constructable<LoggingEventListener> | 'LoggingEventListener';
};

type LocalStateProviderOptions = { statePath: string; type: LocalStateProvider | 'LocalStateProvider' };
type TestStateProviderOptions = { type: TestStateProvider | 'TestStateProvider' };

interface IRunDefinition {
  env: { key: string; kind: 'boolean' | 'number' | 'string'; value: unknown }[];
  hooks: Array<{
    importPath: string;
    method: HookMethodSignature | string;
  }>;
  imports: Array<{
    className: Constructable<any> | string;
    importPath: string;
  }>;
  modules: Array<{
    moduleClass: Constructable<any> | string;
    moduleId: string;
    moduleInputs: Record<string, unknown>;
  }>;
  settings: {
    listeners?: (HtmlReportEventListenerOptions | LoggingEventListenerOptions)[];
    stateProvider: LocalStateProviderOptions | TestStateProviderOptions;
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

async function applyEnvOverrides(definition: IRunDefinition): Promise<void> {
  // Setup listeners.
  if (!definition.settings.listeners) {
    definition.settings.listeners = [];
  } else {
    for (let i = definition.settings.listeners.length - 1; i >= 0; i--) {
      if (definition.settings.listeners[i].type === 'HtmlReportEventListener') {
        if (process.env.OCTO_DISABLE_HTML_REPORT_EVENT_LISTENER?.toLowerCase() === 'true') {
          definition.settings.listeners.splice(i, 1);
        } else {
          const imported = await import('@quadnix/octo-event-listeners/html-report');
          definition.settings.listeners[i].type = imported.HtmlReportEventListener;
        }
      } else if (definition.settings.listeners[i].type === 'LoggingEventListener') {
        if (process.env.OCTO_DISABLE_LOGGING_EVENT_LISTENER?.toLowerCase() === 'true') {
          definition.settings.listeners.splice(i, 1);
        } else {
          const imported = await import('@quadnix/octo-event-listeners/logging');
          definition.settings.listeners[i].type = imported.LoggingEventListener;
        }
      }
    }
  }

  // Setup state provider.
  if (definition.settings.stateProvider.type === 'LocalStateProvider') {
    definition.settings.stateProvider.type = new LocalStateProvider(
      (definition.settings.stateProvider as LocalStateProviderOptions).statePath,
    );
  } else if (definition.settings.stateProvider.type === 'TestStateProvider') {
    definition.settings.stateProvider.type = new TestStateProvider();
  }

  // Setup transaction options.
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

  // Setup version.
  if (!definition.version) {
    definition.version = 1;
  } else {
    definition.version = Number(definition.version);
  }
}

async function resolveHooks(definition: IRunDefinition): Promise<void> {
  if (!definition.hooks) {
    definition.hooks = [];
  }

  for (const hookDef of definition.hooks) {
    const { importPath, method } = hookDef;
    if (!importPath || !method) {
      console.log(chalk.red(`Invalid hook definition: "importPath" and "method" are required!`));
      process.exit(1);
    }

    const resolvedImport =
      importPath.startsWith('.') || importPath.startsWith('/') ? resolve(process.cwd(), importPath) : importPath;

    try {
      const imported = await import(resolvedImport);
      if (!imported[method as string]) {
        console.log(chalk.red(`Unable to find export "${method}" in path "${resolvedImport}"!`));
        process.exit(1);
      } else {
        hookDef.method = imported[method as string];
      }
    } catch (error: any) {
      console.log(chalk.red(`Failed to import path "${resolvedImport}": ${error?.message || String(error)}`));
      process.exit(1);
    }
  }
}

async function resolveImports(definition: IRunDefinition): Promise<void> {
  if (!definition.imports) {
    definition.imports = [];
  }

  for (const importDef of definition.imports) {
    const { className, importPath } = importDef;
    if (!importPath || !className) {
      console.log(chalk.red(`Invalid import definition: "className" and "importPath" are required!`));
      process.exit(1);
    }

    const resolvedImport =
      importPath.startsWith('.') || importPath.startsWith('/') ? resolve(process.cwd(), importPath) : importPath;

    try {
      const imported = await import(resolvedImport);
      if (!imported[className as string]) {
        console.log(chalk.red(`Unable to find export "${className}" in path "${resolvedImport}"!`));
        process.exit(1);
      } else {
        importDef.className = imported[className as string];
      }
    } catch (error: any) {
      console.log(chalk.red(`Failed to import path "${resolvedImport}": ${error?.message || String(error)}`));
      process.exit(1);
    }
  }
}

function resolveModules(definition: IRunDefinition): void {
  for (const { key, value } of definition.env || []) {
    customEnvironmentVariables[key] = value;
  }

  if (!definition.modules || definition.modules.length === 0) {
    console.log(chalk.red('At least 1 module is required to run!'));
    process.exit(1);
  }

  for (const moduleDef of definition.modules) {
    const { moduleClass, moduleId, moduleInputs } = moduleDef;
    const importedModule = definition.imports.find((i) => (i.className as Constructable<any>).name === moduleClass);
    if (!moduleClass || !importedModule) {
      console.log(chalk.red(`Invalid module definition for moduleId="${moduleId}": "${moduleClass}" not found!`));
      process.exit(1);
    }
    moduleDef.moduleClass = importedModule.className;

    for (const [key, value] of Object.entries(moduleInputs || {})) {
      if (typeof value === 'string') {
        const pattern = value.match(/^\$\{env\.(.+)}$/);
        if (pattern && pattern.length >= 2) {
          let resolvedValue = process.env[pattern[1]] || customEnvironmentVariables[pattern[1]];
          const { kind } = definition.env.find((e) => e.key === pattern[1])!;
          switch (kind) {
            case 'boolean': {
              resolvedValue = Boolean(resolvedValue);
              break;
            }
            case 'number': {
              resolvedValue = Number(resolvedValue);
              break;
            }
            default: {
              resolvedValue = String(resolvedValue);
            }
          }
          moduleInputs[key] = resolvedValue;
        }
      }
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
    await applyEnvOverrides(definition);
    await resolveHooks(definition);
    await resolveImports(definition);
    resolveModules(definition);
    console.log(chalk.green('Definition file is valid and all modules were successfully imported.'));

    // Initialize.
    const octo = new Octo();
    await octo.initialize(
      definition.settings.stateProvider.type as IStateProvider,
      definition.settings.listeners!.map((l) => ({
        options: {
          args: l.args,
          metadata: l.metadata,
        },
        type: l.type,
      })),
    );

    // Register hooks.
    for (const hookDef of definition.hooks) {
      octo.registerHooks((hookDef.method as HookMethodSignature)());
    }

    // Load modules.
    for (const moduleDefinition of definition.modules) {
      octo.loadModule(moduleDefinition.moduleClass, moduleDefinition.moduleId, moduleDefinition.moduleInputs);
    }
    octo.orderModules(definition.modules.map((m) => m.moduleClass));

    // Compose.
    const appModuleId = definition.modules[0].moduleId;
    const modules = await octo.compose();
    const app = modules[`${appModuleId}.model.app`] as App;

    // Start transaction.
    const transaction = octo.beginTransaction(app, definition.settings.transactionOptions);
    if (definition.settings.transactionOptions?.yieldModelDiffs === true) {
      const result = await transaction.next();
      console.log(chalk.green('==== Model Diffs ===='));
      console.log(JSON.stringify(result.value, null, 2));
    }
    if (definition.settings.transactionOptions?.yieldModelTransaction === true) {
      const result = await transaction.next();
      console.log(chalk.green('==== Model Transaction ===='));
      console.log(JSON.stringify(result.value, null, 2));
    }
    if (definition.settings.transactionOptions?.yieldResourceDiffs === true) {
      const result = await transaction.next();
      console.log(chalk.green('==== Resource Diffs ===='));
      console.log(JSON.stringify(result.value, null, 2));
    }
    if (definition.settings.transactionOptions?.yieldResourceTransaction === true) {
      const result = await transaction.next();
      console.log(chalk.green('==== Resource Transaction ===='));
      console.log(JSON.stringify(result.value, null, 2));
    }

    const result = await transaction.next();
    if (definition.settings.transactionOptions?.yieldResourceTransaction !== true) {
      console.log(chalk.green('==== Resource Transaction ===='));
      console.log(JSON.stringify(result.value, null, 2));
    }
  },
};
