import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { type Constructable, LocalStateProvider, TestStateProvider } from '@quadnix/octo';
import type { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import type { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface IYamlDefinition {
  env: { key: string; kind: 'boolean' | 'number' | 'string'; value: unknown }[];
  hooks: Array<{
    importPath: string;
    method: string;
  }>;
  imports: Array<{
    className: string;
    importPath: string;
  }>;
  modules: Array<{
    moduleClass: string;
    moduleId: string;
    moduleInputs: Record<string, unknown>;
  }>;
  settings: {
    listeners?: (
      | {
          type: 'HtmlReportEventListener';
        }
      | {
          type: 'LoggingEventListener';
        }
    )[];
    stateProvider: { statePath: string; type: 'LocalStateProvider' } | { type: 'TestStateProvider' };
    transactionOptions?: {
      yieldModelDiffs?: boolean;
      yieldModelTransaction?: boolean;
      yieldResourceDiffs?: boolean;
      yieldResourceTransaction?: boolean;
    };
  };
  version: number;
}

export class YamlDefinitionUtility {
  private readonly definition: IYamlDefinition;

  constructor(definitionFilePath: string) {
    definitionFilePath = resolve(process.cwd(), definitionFilePath);

    if (!existsSync(definitionFilePath)) {
      throw new Error('Cannot find definition file: ' + definitionFilePath);
    }

    try {
      const content = readFileSync(definitionFilePath, 'utf-8');
      this.definition = (load(content) || {}) as IYamlDefinition;
    } catch (error: any) {
      throw new Error('Unable to parse definition file: ' + error?.message);
    }

    this.validateDefinition();
  }

  resolveEnvironmentValue<T>(value: unknown): T {
    if (typeof value !== 'string') {
      return value as T;
    }

    const pattern = value.match(/^\$\{env\.(.+)}$/);
    if (!pattern || pattern.length < 2) {
      return value as T;
    }

    const environmentKey = this.definition.env.find((e) => e.key === pattern[1]);
    if (!environmentKey) {
      throw new Error(`Key "${pattern[1]}" not found under "env"!`);
    }

    let resolvedValue = process.env[pattern[1]] || environmentKey.value;

    const { kind } = environmentKey;
    switch (kind) {
      case 'boolean': {
        return Boolean(resolvedValue) as T;
      }
      case 'number': {
        return Number(resolvedValue) as T;
      }
      default: {
        return String(resolvedValue) as T;
      }
    }
  }

  async resolveHooks(): Promise<{
    postCommitHooks?: { handle: any }[];
    postModelActionHooks?: { action: any; handle: any }[];
    postResourceActionHooks?: { action: any; handle: any }[];
    preCommitHooks?: { handle: any }[];
    preModelActionHooks?: { action: any; handle: any }[];
    preResourceActionHooks?: { action: any; handle: any }[];
  }> {
    const hooks: Awaited<ReturnType<YamlDefinitionUtility['resolveHooks']>> = {
      postCommitHooks: [],
      postModelActionHooks: [],
      postResourceActionHooks: [],
      preCommitHooks: [],
      preModelActionHooks: [],
      preResourceActionHooks: [],
    };

    if (!this.definition.hooks?.length) {
      return hooks;
    }

    for (const hookDef of this.definition.hooks) {
      const { importPath, method } = hookDef;
      const resolvedImport =
        importPath.startsWith('.') || importPath.startsWith('/') ? resolve(process.cwd(), importPath) : importPath;

      try {
        const imported = await import(resolvedImport);
        if (!imported[method]) {
          throw new Error(`Unable to find export "${method}" in path "${resolvedImport}"!`);
        } else {
          const importedHooks = imported[method]();
          hooks.postCommitHooks!.push(...(importedHooks.postCommitHooks || []));
          hooks.postModelActionHooks!.push(...(importedHooks.postModelActionHooks || []));
          hooks.postResourceActionHooks!.push(...(importedHooks.postResourceActionHooks || []));
          hooks.preCommitHooks!.push(...(importedHooks.preCommitHooks || []));
          hooks.preModelActionHooks!.push(...(importedHooks.preModelActionHooks || []));
          hooks.preResourceActionHooks!.push(...(importedHooks.preResourceActionHooks || []));
        }
      } catch (error: any) {
        throw new Error(`Failed to import path "${resolvedImport}": ${error?.message || String(error)}`);
      }
    }

    return hooks;
  }

  async resolveImports(): Promise<{ className: Constructable<any> }[]> {
    const imports: Awaited<ReturnType<YamlDefinitionUtility['resolveImports']>> = [];

    if (!this.definition.imports?.length) {
      return imports;
    }

    for (const importDef of this.definition.imports) {
      const { className, importPath } = importDef;
      const resolvedImport =
        importPath.startsWith('.') || importPath.startsWith('/') ? resolve(process.cwd(), importPath) : importPath;

      try {
        const imported = await import(resolvedImport);
        if (!imported[className]) {
          throw new Error(`Unable to find export "${className}" in path "${resolvedImport}"!`);
        } else {
          imports.push({ className: imported[className] });
        }
      } catch (error: any) {
        throw new Error(`Failed to import path "${resolvedImport}": ${error?.message || String(error)}`);
      }
    }

    return imports;
  }

  async resolveListeners(): Promise<
    {
      args?: unknown[];
      metadata?: Record<string, string>;
      type: Constructable<HtmlReportEventListener | LoggingEventListener>;
    }[]
  > {
    const listeners: Awaited<ReturnType<YamlDefinitionUtility['resolveListeners']>> = [];

    if (!this.definition.settings?.listeners?.length) {
      return listeners;
    }

    for (const listenerDef of this.definition.settings.listeners) {
      if (listenerDef.type === 'HtmlReportEventListener') {
        if (process.env.OCTO_DISABLE_HTML_REPORT_EVENT_LISTENER?.toLowerCase() !== 'true') {
          const imported = await import('@quadnix/octo-event-listeners/html-report');
          listeners.push({ type: imported.HtmlReportEventListener });
        }
      } else if (listenerDef.type === 'LoggingEventListener') {
        if (process.env.OCTO_DISABLE_LOGGING_EVENT_LISTENER?.toLowerCase() !== 'true') {
          const imported = await import('@quadnix/octo-event-listeners/logging');
          listeners.push({ type: imported.LoggingEventListener });
        }
      }
    }

    return listeners;
  }

  resolveModules(
    imports: Awaited<ReturnType<YamlDefinitionUtility['resolveImports']>>,
  ): { moduleClass: Constructable<any>; moduleId: string; moduleInputs: Record<string, unknown> }[] {
    const modules: ReturnType<YamlDefinitionUtility['resolveModules']> = [];

    if (!this.definition.modules?.length) {
      return modules;
    }

    for (const moduleDef of this.definition.modules) {
      const { moduleClass, moduleId, moduleInputs } = moduleDef;
      const importedModule = imports.find((i) => i.className.name === moduleClass);
      if (!importedModule) {
        throw new Error(
          `Invalid module definition for moduleId="${moduleId}": "${moduleClass}" not found in "imports"!`,
        );
      }
      const module = { moduleClass: importedModule.className, moduleId, moduleInputs };

      for (const [key, value] of Object.entries(module.moduleInputs || {})) {
        module.moduleInputs[key] = this.resolveEnvironmentValue(value);
      }

      modules.push(module);
    }

    return modules;
  }

  resolveStateProvider(): { type: LocalStateProvider } | { type: TestStateProvider } {
    const stateProvider = this.definition.settings.stateProvider;
    if (stateProvider.type === 'LocalStateProvider') {
      return {
        type: new LocalStateProvider(stateProvider.statePath),
      };
    } else if (stateProvider.type === 'TestStateProvider') {
      return {
        type: new TestStateProvider(),
      };
    } else {
      throw new Error(`Invalid state provider!`);
    }
  }

  resolveTransactionOptions(): {
    enableResourceCapture: boolean;
    enableResourceValidation: boolean;
    yieldModelDiffs: boolean;
    yieldModelTransaction: boolean;
    yieldResourceDiffs: boolean;
    yieldResourceTransaction: boolean;
  } {
    const tx = this.definition.settings.transactionOptions || {};
    const options: ReturnType<YamlDefinitionUtility['resolveTransactionOptions']> = {
      enableResourceCapture: false,
      enableResourceValidation: false,
      yieldModelDiffs: tx.yieldModelDiffs || false,
      yieldModelTransaction: tx.yieldModelTransaction || false,
      yieldResourceDiffs: tx.yieldResourceDiffs || false,
      yieldResourceTransaction: tx.yieldResourceTransaction || false,
    };

    if (process.env.OCTO_ENABLE_RESOURCE_CAPTURE) {
      options.enableResourceCapture = process.env.OCTO_ENABLE_RESOURCE_CAPTURE.toLowerCase() === 'true';
    }
    if (process.env.OCTO_ENABLE_RESOURCE_VALIDATION) {
      options.enableResourceValidation = process.env.OCTO_ENABLE_RESOURCE_VALIDATION.toLowerCase() === 'true';
    }
    if (process.env.OCTO_YIELD_MODEL_DIFFS) {
      options.yieldModelDiffs = process.env.OCTO_YIELD_MODEL_DIFFS.toLowerCase() === 'true';
    }
    if (process.env.OCTO_YIELD_MODEL_TRANSACTION) {
      options.yieldModelTransaction = process.env.OCTO_YIELD_MODEL_TRANSACTION.toLowerCase() === 'true';
    }
    if (process.env.OCTO_YIELD_RESOURCE_DIFFS) {
      options.yieldResourceDiffs = process.env.OCTO_YIELD_RESOURCE_DIFFS.toLowerCase() === 'true';
    }
    if (process.env.OCTO_YIELD_RESOURCE_TRANSACTION) {
      options.yieldResourceTransaction = process.env.OCTO_YIELD_RESOURCE_TRANSACTION.toLowerCase() === 'true';
    }

    return options;
  }

  private validateDefinition(): void {
    if (!this.definition?.version || typeof this.definition?.version !== 'number') {
      throw new Error(`Definition version "${this.definition?.version}" must be a number!`);
    }

    const schemaPath =
      this.definition.version === 1
        ? resolve(join(__dirname, '..', '..', '..', 'resources', 'octo-v1.schema.json'))
        : undefined;
    if (!schemaPath) {
      throw new Error(`Could not find schema for version "${this.definition.version}"!`);
    }

    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);

    const valid = validate(this.definition);
    if (!valid) {
      const error = new Error('Definition file failed validation against schema!');

      const failures: string[] = [];
      for (const err of validate.errors || []) {
        failures.push(`  [${err.instancePath || '/'}] ${err.message}`);
      }
      error['failures'] = failures;

      throw error;
    }
  }
}
