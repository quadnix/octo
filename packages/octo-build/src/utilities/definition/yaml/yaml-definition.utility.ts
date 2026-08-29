import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  type Constructable,
  LocalEncryptionStateProvider,
  LocalStateProvider,
  type Octo,
  TestStateProvider,
} from '@quadnix/octo';
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
          reportDir?: string;
          type: 'HtmlReportEventListener';
        }
      | {
          colorize?: boolean;
          level?: string;
          type: 'LoggingEventListener';
        }
    )[];
    stateProvider:
      | { encryptionKey: string; statePath: string; type: 'LocalEncryptionStateProvider' }
      | { statePath: string; type: 'LocalStateProvider' }
      | { type: 'TestStateProvider' };
  };
  tags: Array<{
    scope?: { moduleId?: string };
    tags: Record<string, unknown>;
  }>;
  terraform: {
    providers: Array<{
      accountId: string;
      accountName?: string;
      providerType: string;
      regionId: string;
      setRegionAttribute?: boolean;
      spec?: Record<string, unknown>;
    }>;
    requiredProviders: Record<string, { minVersion?: string; source: string }>;
    requiredVersion: string;
  };
  version: number;
}

/**
 * Reads `octo.yml` and turns each section into the values {@link Octo} is booted with.
 */
export class YamlDefinitionUtility {
  private readonly definition: IYamlDefinition;

  /**
   * The directory holding the definition file. Everything the definition names by relative path is
   * resolved against this, not against `process.cwd()`: `octo run-action` is invoked by terraform
   * from inside a terragrunt cache directory, so the cwd there is neither the project nor stable.
   */
  private readonly definitionDir: string;

  /**
   * @param definitionFilePath Path to the definition file.
   * @throws If the file is unreadable, or fails schema validation.
   */
  constructor(definitionFilePath: string) {
    definitionFilePath = resolve(process.cwd(), definitionFilePath);
    this.definitionDir = dirname(definitionFilePath);

    if (!existsSync(definitionFilePath)) {
      throw new Error('Cannot find definition file: ' + definitionFilePath);
    }

    try {
      const content = readFileSync(definitionFilePath, 'utf-8');
      this.definition = (load(content) || {}) as IYamlDefinition;
    } catch (error) {
      throw new Error('Unable to parse definition file: ' + error?.message);
    }

    this.validateDefinition();
  }

  /**
   * Substitutes `${env.KEY}` references in a value with what the definition's `env` block declares.
   *
   * Arrays and objects are walked, because a module input is as nested as its schema: a reference
   * can sit inside a list of images, or a key of an object, as readily as at the top level.
   *
   * @throws If a value holds one of its own ancestors, which no substitution over it terminates on.
   */
  resolveEnvironmentValue<T>(value: unknown): T {
    return this.resolveNestedEnvironmentValue(value, new Set());
  }

  /**
   * Imports the hook callbacks the definition names, in the shape {@link Octo.registerHooks} takes.
   */
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

      try {
        const resolvedImport = this.resolveImportPath(importPath);
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
      } catch (error) {
        throw new Error(`Failed to import path "${importPath}": ${error?.message || String(error)}`);
      }
    }

    return hooks;
  }

  /**
   * Imports every module class the definition's `imports` block names.
   */
  async resolveImports(): Promise<{ className: Constructable<any> }[]> {
    const imports: Awaited<ReturnType<YamlDefinitionUtility['resolveImports']>> = [];

    if (!this.definition.imports?.length) {
      return imports;
    }

    for (const importDef of this.definition.imports) {
      const { className, importPath } = importDef;

      try {
        const resolvedImport = this.resolveImportPath(importPath);
        const imported = await import(resolvedImport);
        if (!imported[className]) {
          throw new Error(`Unable to find export "${className}" in path "${resolvedImport}"!`);
        } else {
          imports.push({ className: imported[className] });
        }
      } catch (error) {
        throw new Error(`Failed to import path "${importPath}": ${error?.message || String(error)}`);
      }
    }

    return imports;
  }

  /**
   * @param logDestination Where the logging listener writes. `run-action` passes `stderr`, because
   * terraform's `data "external"` protocol requires that command's stdout to carry only the response
   * JSON.
   */
  async resolveListeners({ logDestination = 'stdout' }: { logDestination?: 'stderr' | 'stdout' } = {}): Promise<
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
        const imported = await import('@quadnix/octo-event-listeners/html-report');
        listeners.push({
          args: [{ reportDir: listenerDef.reportDir }],
          type: imported.HtmlReportEventListener,
        });
      } else if (listenerDef.type === 'LoggingEventListener') {
        const imported = await import('@quadnix/octo-event-listeners/logging');
        // Default to whether the destination is a terminal, so a redirected log carries no escape
        // codes. An explicit `colorize:` in the definition still wins.
        const destinationStream = logDestination === 'stderr' ? process.stderr : process.stdout;
        listeners.push({
          args: [
            {
              colorize: listenerDef.colorize ?? Boolean(destinationStream.isTTY),
              destination: logDestination,
              level: listenerDef.level ?? 'info',
            },
          ],
          type: imported.LoggingEventListener,
        });
      }
    }

    return listeners;
  }

  /**
   * Pairs each `modules` entry with its imported class, and resolves its inputs.
   */
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

  /**
   * Builds the {@link IStateProvider} the definition asks for.
   */
  resolveStateProvider():
    | { type: LocalEncryptionStateProvider }
    | { type: LocalStateProvider }
    | { type: TestStateProvider } {
    const stateProvider = this.definition.settings.stateProvider;
    // Anchored to the definition file for the same reason imports are: `run-action` runs with
    // terragrunt's cache directory as its cwd, and a state path resolved from there would point at
    // an empty directory - the action would read no prior state and write its result nowhere useful.
    if (stateProvider.type === 'LocalEncryptionStateProvider') {
      return {
        type: new LocalEncryptionStateProvider(
          resolve(this.definitionDir, stateProvider.statePath),
          stateProvider.encryptionKey,
        ),
      };
    } else if (stateProvider.type === 'LocalStateProvider') {
      return {
        type: new LocalStateProvider(resolve(this.definitionDir, stateProvider.statePath)),
      };
    } else if (stateProvider.type === 'TestStateProvider') {
      return {
        type: new TestStateProvider(),
      };
    } else {
      throw new Error(`Invalid state provider!`);
    }
  }

  /**
   * The tag registrations the definition declares, in the shape {@link Octo.registerTags} takes.
   *
   * A `scope` naming a `moduleId` reaches that module's resources; an absent or empty one reaches
   * every resource of the run.
   */
  resolveTags(): Parameters<Octo['registerTags']>[0] {
    const tags: ReturnType<YamlDefinitionUtility['resolveTags']> = [];

    if (!this.definition.tags?.length) {
      return tags;
    }

    for (const tagDefinition of this.definition.tags) {
      const resolvedTags: { [key: string]: string } = {};
      for (const [key, value] of Object.entries(tagDefinition.tags)) {
        // A tag value is always a string, so an `${env.KEY}` declared as a number or a boolean is
        // rendered rather than handed to the resource as the kind it was declared with.
        resolvedTags[key] = String(this.resolveEnvironmentValue(value));
      }

      tags.push({ scope: tagDefinition.scope || {}, tags: resolvedTags });
    }

    return tags;
  }

  /**
   * The terraform version, required providers, and provider blocks the definition declares.
   */
  resolveTerraformOptions(): {
    providers: {
      accountId: string;
      accountName: string | undefined;
      providerType: string;
      regionId: string;
      setRegionAttribute: boolean | undefined;
      spec: Record<string, unknown>;
    }[];
    requiredProviders: Record<string, { minVersion?: string; source: string }>;
    requiredVersion: string;
  } {
    const terraform = this.definition.terraform;

    const providers = terraform.providers.map((p) => {
      const spec: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(p.spec || {})) {
        spec[key] = this.resolveEnvironmentValue(value);
      }

      return {
        accountId: this.resolveEnvironmentValue<string>(p.accountId),
        accountName: p.accountName ? this.resolveEnvironmentValue<string>(p.accountName) : undefined,
        providerType: p.providerType,
        regionId: this.resolveEnvironmentValue<string>(p.regionId),
        // Passed through as-is: undefined lets octo apply its per-provider-type default.
        setRegionAttribute: p.setRegionAttribute,
        spec,
      };
    });

    return {
      providers,
      requiredProviders: terraform.requiredProviders,
      requiredVersion: this.resolveEnvironmentValue<string>(terraform.requiredVersion),
    };
  }

  /**
   * Substitutes one `${env.KEY}` reference with what the definition's `env` block declares for that
   * key, read in the kind the block gives it. Anything holding no reference is returned as it came.
   */
  private resolveEnvironmentReference<T>(value: unknown): T {
    if (typeof value !== 'string') {
      return value as T;
    }

    const pattern = value.match(/^\$\{env\.(.+)}$/);
    if (!pattern || pattern.length < 2) {
      return value as T;
    }

    // `env` is optional in the schema, so a definition can reference `${env.X}` without declaring
    // one. Treat that as an empty block and let the "not found" error below report it.
    const environmentKey = (this.definition.env ?? []).find((e) => e.key === pattern[1]);
    if (!environmentKey) {
      throw new Error(`Key "${pattern[1]}" not found under "env"!`);
    }

    let resolvedValue = process.env[pattern[1]] || environmentKey.value;

    const { kind } = environmentKey;
    switch (kind) {
      case 'boolean': {
        // A shell always supplies a string, and `Boolean("false")` is `true`. Parse the string form
        // rather than coercing it, and reject anything that is not plainly a boolean.
        if (typeof resolvedValue === 'boolean') {
          return resolvedValue as T;
        }
        const normalizedValue = String(resolvedValue).trim().toLowerCase();
        if (normalizedValue === 'true') {
          return true as T;
        } else if (normalizedValue === 'false') {
          return false as T;
        } else {
          throw new Error(`Value "${resolvedValue}" for key "${pattern[1]}" is not a boolean!`);
        }
      }
      case 'number': {
        return Number(resolvedValue) as T;
      }
      default: {
        return String(resolvedValue) as T;
      }
    }
  }

  /**
   * Resolves a definition-file import specifier to something `import()` can load.
   *
   * A relative path resolves against the **definition file's own directory**. It cannot resolve
   * against the current working directory: terraform invokes `octo run-action` from inside a
   * terragrunt cache directory, so a definition saying `./dist/index.js` - which is what every
   * generated app says - would be looked for under the cache and never found.
   *
   * A bare specifier resolves against the **user's project root**, not octo-build's own install
   * directory - node would otherwise resolve it from wherever octo-build happens to live. A flat
   * `node_modules` hides that; a linked store does not, and there the user's own dependencies are
   * invisible.
   */
  private resolveImportPath(importPath: string): string {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return resolve(this.definitionDir, importPath);
    }

    const requireFromProject = createRequire(join(this.definitionDir, 'package.json'));
    return pathToFileURL(requireFromProject.resolve(importPath)).href;
  }

  /**
   * Walks a value, substituting every `${env.KEY}` reference it holds at any depth.
   *
   * `ancestors` is the chain currently being walked rather than everything already seen. A YAML
   * anchor used in two places points one node at two parents, which resolves twice and is no cycle;
   * a node reappearing beneath itself is one, and walking it never ends.
   *
   * @throws If a value holds one of its own ancestors.
   */
  private resolveNestedEnvironmentValue<T>(value: unknown, ancestors: Set<object>): T {
    if (value === null || typeof value !== 'object') {
      return this.resolveEnvironmentReference(value);
    }

    if (ancestors.has(value)) {
      throw new Error('Definition holds a value that contains itself!');
    }
    ancestors.add(value);

    const resolvedValue = Array.isArray(value)
      ? value.map((v) => this.resolveNestedEnvironmentValue(v, ancestors))
      : Object.fromEntries(
          Object.entries(value).map(([key, v]) => [key, this.resolveNestedEnvironmentValue(v, ancestors)]),
        );

    ancestors.delete(value);
    return resolvedValue as T;
  }

  /**
   * Checks the definition against `octo-v1.schema.json`.
   */
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
