import { strict as assert } from 'assert';
import type {
  Constructable,
  ModuleSchemaInputs,
  TerraformFolderOutput,
  TerraformResourceOutput,
  UnknownModule,
  UnknownResource,
} from './app.type.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import { ModuleError, TransactionError } from './errors/index.js';
import {
  CommitModeCompletedEvent,
  type ModeEventPayload,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  type OctoMode,
  TerraformFoldersWrittenEvent,
  ValidateModeCompletedEvent,
} from './events/index.js';
import { Container } from './functions/container/container.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { type ModelTransactionResult, applyModelTransaction } from './modes/apply-transaction.js';
import { type TerraformOutputs, commit as runCommit } from './modes/commit.mode.js';
import { generate as runGenerate } from './modes/generate.mode.js';
import { runAction as runRunAction } from './modes/run-action.mode.js';
import { type TerraformPlan, validate as runValidate } from './modes/validate.mode.js';
import { ModuleContainer } from './modules/module.container.js';
import { EventService } from './services/event/event.service.js';
import { ImportReaderService, type ImportReaderServiceFactory } from './services/import/import-reader.service.js';
import { ImportService } from './services/import/import.service.js';
import { InputService } from './services/input/input.service.js';
import { SchemaTranslationService } from './services/schema-translation/schema-translation.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import {
  StateManagementService,
  StateManagementServiceFactory,
} from './services/state-management/state-management.service.js';
import type { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TerraformStateService } from './services/state-management/terraform-state.service.js';
import { TerraformService } from './services/terraform/terraform.service.js';

/**
 * The entry point to Octo.
 *
 * You describe infrastructure by loading modules, and Octo turns that description into terraform,
 * checks what terraform intends to do, and records what it did. That is the lifecycle, and it is
 * always these four steps:
 *
 * 1. {@link Octo.generate} - write the terraform module folders for the infrastructure you described.
 * 2. {@link Octo.validate} - correlate terraform's plans with your intent, and report the difference.
 * 3. `terraform apply` - see {@link TerraformUtility}. Octo does not do this for you.
 * 4. {@link Octo.commit} - record the applied result back into Octo's state.
 *
 * Splitting them is deliberate: nothing is applied until you have seen a report of what would change,
 * and each step is a separate process, so a CI pipeline can gate between them.
 *
 * @example
 * ```ts
 * const octo = new Octo();
 * await octo.initialize(new LocalStateProvider('./infrastructure'));
 *
 * octo.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
 * octo.registerTerraformProvider('aws', '1234567890', 'us-east-1');
 *
 * octo.loadModule(SimpleAppModule, 'app-module', { name: 'my-app' });
 * await octo.compose();
 *
 * await octo.generate(octo.getRootModel(), { outputDir: './infrastructure/terraform' });
 * ```
 *
 * @group Main
 *
 * @see Definition of [Modules](/docs/fundamentals/modules).
 */
export class Octo {
  private eventService: EventService;
  private importReaderService: ImportReaderService;
  private importService: ImportService;
  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private moduleContainer: ModuleContainer;
  private resourceSerializationService: ResourceSerializationService;
  private schemaTranslationService: SchemaTranslationService;
  private stateManagementService: StateManagementService;
  private terraformService: TerraformService;

  /**
   * The last step of the lifecycle - records the result of a `terraform apply` back into Octo's state.
   *
   * A terraform apply reports what it created, and part of that is what each octo resource's
   * `response` is made of - ARNs, generated IDs, endpoints. Without this step the next run has no
   * idea any of it exists.
   *
   * **All-or-nothing**: if an expected output is missing, this throws before touching state, so a
   * partial apply never leaves a half-written record behind. Pass `partial` after an apply that
   * failed and the missing outputs become warnings instead, with every resource they belong to left
   * out of the committed graph. Outputs for a folder Octo does not track are ignored, and returned
   * as warnings for you to surface. The modules whose folders were emptied are returned as
   * `emptiedModuleIds`, for `TerraformUtility.deleteDestroyedFolders`; one whose terraform state still
   * holds resources stays recorded, so the next generate writes it again.
   *
   * **Requires the lock**, and does not release it. Taking and releasing the lock belongs to whoever
   * drives the lifecycle - the CLI's `octo commit` releases it once this returns, and keeps it when this
   * throws.
   *
   * @param app The root model, from {@link Octo.getRootModel}.
   * @param options `lockId` is the lock from `octo lock`. `outputs` is
   * `TerraformUtility.output(dir, { json: true })` in full. `partial` records what a failed apply
   * did build.
   * @param transaction The model transaction result.
   * @throws {@link TransactionError} When the app is not locked, or `lockId` is not the lock held.
   */
  async commit(
    app: App,
    options: { lockId: string; outputs: Map<string, TerraformOutputs>; partial?: boolean },
    transaction?: ModelTransactionResult,
  ): Promise<Pick<Awaited<ReturnType<typeof runCommit>>, 'emptiedModuleIds' | 'warnings'>> {
    // Checked before the mode starts, so a commit without the lock reads no state and writes none.
    if (!(await this.stateManagementService.isAppLocked(options.lockId))) {
      throw new TransactionError('App is not locked!');
    }

    return this.runMode('commit', app.name, async () => {
      const { userData } = await this.stateManagementService.getResourceState(
        this.stateManagementService.actualResourceStateFileName,
      );

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const { externalResourceIds, modelTransaction, ...completed } = await runCommit({
        ...options,
        previousFolders: userData.terraformFolders ?? [],
        previousMappings: userData.terraformResources ?? [],
        transaction: resolvedTransaction,
      });

      // Keep recording an emptied folder whose terraform state still holds resources, so the next
      // generate writes it again and an apply destroys what it holds.
      const terraformStateService = await Container.getInstance().get(TerraformStateService);
      const retainedFolders: TerraformFolderOutput[] = [];
      for (const folder of userData.terraformFolders ?? []) {
        if (
          completed.emptiedModuleIds.includes(folder.moduleId) &&
          (await terraformStateService.holdsState(folder.moduleId))
        ) {
          retainedFolders.push(folder);
        }
      }

      await this.commitTransaction(app, modelTransaction, [], retainedFolders);

      // The committed graph now carries everything an external resource's actions made of it, so the
      // records they wrote mid-apply are cleared. Done after the state is persisted, so a failure
      // here costs a stale record rather than the record itself.
      await Promise.all(
        externalResourceIds.map((resourceId) => this.stateManagementService.deleteExternalResourceState(resourceId)),
      );

      // Emitted after the state is persisted, so a listener never sees an uncommitted commit.
      this.eventService.emit(new CommitModeCompletedEvent(undefined, completed));

      return { emptiedModuleIds: completed.emptiedModuleIds, warnings: completed.warnings };
    });
  }

  /**
   * Runs every loaded module, in the order {@link Octo.orderModules} set, building the model graph.
   * Call it once, after loading modules and before any lifecycle step.
   *
   * @returns Every model and overlay the modules created, keyed by a unique ID.
   */
  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  /**
   * To build this app on top of another app's state, without ever changing it.
   *
   * Every model, overlay and resource the other app recorded is declared here under the module that
   * recorded it, as a test declares what already exists, so this app's modules reference them as if
   * they were declared alongside them. Nothing of the other app runs: its nodes take no action, its
   * resources render no terraform, and a reference to one reads the response that app committed. Every
   * class its state names must be loaded. Call it after {@link Octo.initialize} and before loading this
   * app's own modules.
   *
   * @param stateProvider Where the other app's state is read from: its newest sealed state, never a run
   * still under way. This app writes none of its own state there.
   * @throws {@link ModuleError} When the newest sealed state holds no models, or nothing is sealed yet.
   * @throws {@link NodeUnsynthError} When a class the state names is not loaded.
   */
  async extendState(stateProvider: IStateProvider): Promise<void> {
    await this.importReaderService.extendState(stateProvider);
  }

  /**
   * The first step of the lifecycle - writes the terragrunt module folders for the infrastructure you
   * described, one folder per module, and saves the model state.
   *
   * A new module gets a new folder, and a changed module is rewritten in the folder it already has.
   * A module you *removed* is not deleted: its folder is **emptied**, keeping only the provider
   * blocks, so the next terraform apply destroys the live infrastructure rather than orphaning it.
   * Generate never deletes a folder.
   *
   * @param app The root model, from {@link Octo.getRootModel}.
   * @param options `outputDir` is where the module folders are written.
   * @param transaction The model transaction result.
   */
  async generate(
    app: App,
    options: { outputDir: string },
    transaction?: ModelTransactionResult,
  ): ReturnType<typeof runGenerate> {
    return this.runMode('generate', app.name, async () => {
      // The previous folder records must be read before this run writes the new `models.json`, so a
      // module deleted from intent is caught on the generate right after its removal.
      const [{ userData: modelUserData }, { userData: actualResourceUserData }] = await Promise.all([
        this.stateManagementService.getModelState(this.stateManagementService.modelStateFileName),
        this.stateManagementService.getResourceState(this.stateManagementService.actualResourceStateFileName),
      ]);
      // The last commit's record says what terraform state holds; the last generate's may say what
      // was never applied. A folder keeps the providers of both, so neither can strand the other's
      // resources in terraform state without the provider to destroy them.
      const previousFolders = new Map<string, TerraformFolderOutput>();
      for (const record of [
        ...(actualResourceUserData.terraformFolders ?? []),
        ...(modelUserData.terraformFolders ?? []),
      ]) {
        const providers = [...(previousFolders.get(record.moduleId)?.providers ?? [])];
        for (const provider of record.providers) {
          const isRecorded = providers.some(
            (p) =>
              p.providerType === provider.providerType &&
              p.accountId === provider.accountId &&
              p.regionId === provider.regionId,
          );
          if (!isRecorded) {
            providers.push(provider);
          }
        }
        previousFolders.set(record.moduleId, { ...record, providers });
      }

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const previousFolderList = [...previousFolders.values()];
      const resourceDiffs = await runGenerate({
        ...options,
        previousFolders: previousFolderList,
        transaction: resolvedTransaction,
      });

      const written = this.terraformService.getModuleIds();
      this.eventService.emit(
        new TerraformFoldersWrittenEvent(undefined, {
          emptied: previousFolderList
            .map((folder) => folder.moduleId)
            .filter((moduleId) => !written.includes(moduleId)),
          outputDir: options.outputDir,
          written,
        }),
      );

      await this.saveModelState(app);
      await this.importReaderService.saveImportState();
      return resourceDiffs;
    });
  }

  /**
   * To fetch a loaded module by its module ID.
   *
   * @returns The module, or `undefined` if no module was loaded under that ID.
   */
  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  /**
   * To fetch the resources a module produced, by its module ID.
   */
  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  /**
   * The root of the model graph - the one {@link App} the loaded modules produced. Every lifecycle
   * step takes it. Call after {@link Octo.compose}.
   *
   * @throws If no app model, or more than one distinct app model, was registered.
   */
  getRootModel(): App {
    return this.inputService.getRootModel() as App;
  }

  /**
   * Boots Octo. Call it once, before anything else.
   *
   * The two optional arguments are how you replace Octo's internals with your own: exclusions run
   * first, so you can unregister a built-in {@link Factory} and then resolve yours in its place.
   *
   * @param stateProvider Where Octo reads and writes its state. See {@link IStateProvider}.
   * @param initializeInContainer Factories to resolve at boot - event listeners, most commonly.
   * @param excludeInContainer Factories to unregister at boot.
   */
  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      options?: Parameters<Container['get']>[1];
      type: Parameters<Container['get']>[0];
    }[] = [],
    excludeInContainer: {
      type: Parameters<Container['unRegisterFactory']>[0];
    }[] = [],
  ): Promise<void> {
    const container = Container.getInstance();

    [
      this.eventService,
      this.importService,
      this.inputService,
      this.modelSerializationService,
      this.moduleContainer,
      this.resourceSerializationService,
      this.schemaTranslationService,
      this.stateManagementService,
      this.terraformService,
    ] = await Promise.all([
      container.get(EventService),
      container.get(ImportService),
      container.get(InputService),
      container.get(ModelSerializationService),
      container.get(ModuleContainer),
      container.get(ResourceSerializationService),
      container.get(SchemaTranslationService),
      container.get<StateManagementService, typeof StateManagementServiceFactory>(StateManagementService, {
        args: [stateProvider],
      }),
      container.get(TerraformService),
    ]);
    // Built once the state provider is, since it reads this app's state through it.
    this.importReaderService = await container.get<ImportReaderService, typeof ImportReaderServiceFactory>(
      ImportReaderService,
      { args: [true] },
    );

    for (const exclude of excludeInContainer) {
      container.unRegisterFactory(exclude.type);
    }
    for (const initialize of initializeInContainer) {
      await container.get(initialize.type, initialize.options as any);
    }

    // Wait for all factories and startup promises to resolve.
    await container.waitToResolveAllFactories();

    // Reset the runtime environment with the latest state.
    await this.importReaderService.retrieveResourceState();
  }

  /**
   * To load a module, which {@link Octo.compose} will then run.
   *
   * The same module class can be loaded more than once under different module IDs, and the ID scopes
   * everything that instance produces.
   *
   * @param module The module class, or its registered name.
   * @param moduleId A unique ID for this instance of the module.
   * @param inputs The inputs, matching the module's schema.
   * @throws {@link ModuleError} When the module ID holds `:`, or an imported state already uses it.
   */
  loadModule<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: ModuleSchemaInputs<M>,
  ): void {
    if (moduleId.includes(':')) {
      throw new ModuleError(`Module id "${moduleId}" may not hold ":", which names a store!`, moduleId);
    }
    if (this.importService.isImportedModule(moduleId)) {
      throw new ModuleError(`Module id "${moduleId}" is already in use!`, moduleId);
    }
    this.moduleContainer.load(module, moduleId, inputs);
  }

  /**
   * To set the order {@link Octo.compose} runs modules in, by listing their classes.
   *
   * Order matters because a module resolves what earlier modules produced - a subnet module must run
   * after the region module whose region it attaches to.
   */
  orderModules(...args: Parameters<ModuleContainer['order']>): ReturnType<ModuleContainer['order']> {
    this.moduleContainer.order(...args);
  }

  /**
   * To read every state this app extends and every store as this run's `generate` read them, so the
   * commands of one run see one version of each other app. Call it before {@link Octo.extendState}
   * and {@link Octo.readStores} in every command of a run but `generate`. An import that `generate`
   * did not read is read from its newest sealed state.
   */
  async readImportsAsGenerated(): Promise<void> {
    await this.importReaderService.readImportsAsGenerated();
  }

  /**
   * To read other apps' states as stores, each a graph of its own that this app builds next to, never on.
   *
   * A store's models, overlays and resources are declared under its name, so a module input takes one
   * as `${{<name>:<moduleId>.model.<node>}}` and walks from it as from any other. A store is read-only:
   * nothing of it runs, renders terraform or is saved here, and adding a child or a link to one of its
   * nodes fails. This app keeps an app of its own, and saves its own links to a store's resources but
   * never its links to a store's models. A link a store holds into a state not read here is dropped.
   * Every class a store names must be loaded. Call it once, with every store, after
   * {@link Octo.initialize} and before loading this app's own modules.
   *
   * @param stores Each store's name, and where its newest sealed state is read from. This app writes
   * none of its own state there.
   * @throws {@link ModuleError} When a name repeats or holds more than letters, digits, `_` and `-`,
   * when a store has sealed no models, or when two stores hold the same node.
   * @throws {@link NodeUnsynthError} When a class a store names is not loaded.
   */
  async readStores(stores: { name: string; stateProvider: IStateProvider }[]): Promise<void> {
    await this.importReaderService.readStores(stores);
  }

  /**
   * To register callbacks that run at fixed points of the lifecycle. Use them to inject behavior -
   * an audit trail, an approval gate - without modifying the framework.
   *
   * The hook points, each with its own signature:
   * - `PreCommitHook` / `PostCommitHook` - around the commit.
   * - `PreModelActionHook` / `PostModelActionHook` - around every model action.
   * - `PreResourceActionHook` / `PostResourceActionHook` - around every resource action.
   *
   * @see Techniques for [Hooks](/docs/techniques/hooks).
   */
  registerHooks(...args: Parameters<ModuleContainer['registerHooks']>): ReturnType<ModuleContainer['registerHooks']> {
    this.moduleContainer.registerHooks(...args);
  }

  /**
   * To record the version of each package this app's classes come from, octo's included, in its
   * state. A state this app extends, or a store it reads, generated on another version of a package
   * both use, is refused: its classes may read the other's state wrongly.
   */
  registerPackageVersions(
    ...args: Parameters<ImportReaderService['registerPackageVersions']>
  ): ReturnType<ImportReaderService['registerPackageVersions']> {
    this.importReaderService.registerPackageVersions(...args);
  }

  /**
   * To teach Octo how to read one schema as another.
   *
   * Modules find each other by schema, so a module that changes its schema breaks its consumers.
   * A translation is the escape hatch: register the schema you have, the schema your module expects,
   * and a function between them, and the lookup keeps working while you migrate.
   *
   * @see Techniques for [Schema](/docs/techniques/schema).
   */
  registerSchemaTranslation(
    ...args: Parameters<SchemaTranslationService['registerSchemaTranslation']>
  ): ReturnType<SchemaTranslationService['registerSchemaTranslation']> {
    return this.schemaTranslationService.registerSchemaTranslation(...args);
  }

  /**
   * To apply tags to resources in bulk, so that individual modules do not each have to be told about
   * your organization's tagging policy.
   *
   * Each entry's `scope` decides its reach: empty tags every resource of the app, `moduleId` tags
   * every resource of one module, and `resourceContext` tags a single resource.
   */
  registerTags(
    args: { scope: { moduleId?: string; resourceContext?: string }; tags: { [key: string]: string } }[],
  ): void {
    for (const { scope, tags } of args) {
      const isGlobal = !scope.moduleId && !scope.resourceContext;
      this.inputService.registerTag((isGlobal || scope) as Parameters<InputService['registerTag']>[0], tags);
    }
  }

  /**
   * To set the minimum terraform version, and the `required_providers` block rendered into every
   * generated module folder.
   *
   * Call it after {@link Octo.initialize}, and before {@link Octo.generate}.
   */
  registerTerraformConfig(
    ...args: Parameters<TerraformService['addTerraformConfig']>
  ): ReturnType<TerraformService['addTerraformConfig']> {
    return this.terraformService.addTerraformConfig(...args);
  }

  /**
   * To register a terraform provider for one deployment target - a provider type, an account, and a
   * region.
   *
   * Resources bind to a provider by `{ accountId, regionId }` alone, so this is the one place a
   * provider type is named. Register one per account/region combination you deploy into.
   *
   * Call it after {@link Octo.initialize}, and before {@link Octo.generate}.
   */
  registerTerraformProvider(
    ...args: Parameters<TerraformService['addTerraformProvider']>
  ): ReturnType<TerraformService['addTerraformProvider']> {
    return this.terraformService.addTerraformProvider(...args);
  }

  /**
   * Runs one resource action for an external resource.
   *
   * Terraform calls back into this mid-apply, through the generated CLI command; it is not a step you
   * run yourself.
   *
   * @internal
   */
  async runAction(
    app: App,
    options: { inputs?: Record<string, unknown>; resourceId: string },
  ): ReturnType<typeof runRunAction> {
    return this.runMode('run-action', app.name, () => runRunAction(app, options), {
      resourceId: options.resourceId,
    });
  }

  /**
   * The second step of the lifecycle - correlates terraform's plans with your intent, and reports
   * what it finds. This is what you read before deciding whether to apply.
   *
   * The report answers two questions separately:
   * 1. **What will change, and why.** Including terraform changes Octo did not flag directly but can
   *    attribute to something it did - a referenced resource whose identity moved, or an address the
   *    resource no longer renders.
   * 2. **What changed that your intent does not explain** - drift, i.e. infrastructure modified
   *    outside Octo. Read `confidence` first: drift is only reliable when intent itself is unchanged.
   *
   * The report fails only when terraform could not plan a folder Octo generated. Folders Octo does
   * not track are excluded, and noted. So is every external resource a previous run published and no
   * commit has recorded, which is the only step that reads those records back for a user.
   *
   * @param app The root model, from {@link Octo.getRootModel}.
   * @param plans The whole result of `TerraformUtility.plan(dir, { json: true })`. Its `errors` map
   * carries terraform's own message for each folder that failed to plan.
   * @param transaction The model transaction result.
   */
  async validate(
    app: App,
    plans: { errors?: Map<string, string>; plans: Map<string, TerraformPlan> },
    transaction?: ModelTransactionResult,
  ): ReturnType<typeof runValidate> {
    return this.runMode('validate', app.name, async () => {
      const { userData } = await this.stateManagementService.getResourceState(
        this.stateManagementService.actualResourceStateFileName,
      );
      const { terraformFolders, terraformResources } = userData;

      const previousMappings = terraformResources ?? [];
      const persistedMappings = new Map<string, TerraformResourceOutput>();
      for (const mapping of previousMappings) {
        persistedMappings.set(mapping.resourceContext, mapping);
      }

      const externalResourceStateIds = await this.stateManagementService.listExternalResourceStateIds();

      // Build the transaction unless a single-process driver already built it and passed it in.
      const resolvedTransaction = transaction ?? (await applyModelTransaction(app));
      const report = await runValidate({
        externalResourceStateIds,
        persistedMappings,
        planErrors: plans.errors,
        plans: plans.plans,
        previousFolders: terraformFolders ?? [],
        transaction: resolvedTransaction,
      });

      this.eventService.emit(new ValidateModeCompletedEvent(undefined, { report }));

      return report;
    });
  }

  /**
   * This function persists the model and resource state using {@link IStateProvider}.
   * Then immediately fetches the resource state in memory for the next set of operations.
   *
   * @internal
   */
  @EnableHook('CommitHook')
  private async commitTransaction(
    app: App,
    modelTransaction: DiffMetadata[][],
    resourceTransaction: DiffMetadata[][] = [],
    retainedFolders: TerraformFolderOutput[] = [],
  ): Promise<void> {
    // `modelTransaction` and `resourceTransaction` is used by hooks of type CommitHook.
    assert(!!modelTransaction);
    assert(!!resourceTransaction);

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState(retainedFolders);

    // Reset the runtime environment with the latest state.
    await this.importReaderService.retrieveResourceState();
  }

  /**
   * Wraps a mode to emit its boundary events, and re-throws whatever the mode threw.
   * The finishing events use `emitAndWait`, so a listener that writes a file completes first.
   *
   * @internal
   */
  private async runMode<T>(
    mode: OctoMode,
    appName: string,
    body: () => Promise<T>,
    { resourceId }: { resourceId?: string } = {},
  ): Promise<T> {
    const startedAt = Date.now();
    const payload: ModeEventPayload = { appName, mode, ...(resourceId === undefined ? {} : { resourceId }) };

    this.eventService.emit(new ModeStartedEvent(mode, payload));

    let result: T;
    try {
      result = await body();
    } catch (error) {
      await this.eventService.emitAndWait(
        new ModeFailedEvent(mode, {
          ...payload,
          durationInMs: Date.now() - startedAt,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      throw error;
    }

    await this.eventService.emitAndWait(
      new ModeFinishedEvent(mode, { ...payload, durationInMs: Date.now() - startedAt }),
    );
    return result;
  }

  /**
   * This function persists the in-memory model state.
   *
   * @internal
   */
  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    const packageVersions = this.importReaderService.getPackageVersions();
    await this.stateManagementService.saveModelState(
      this.stateManagementService.modelStateFileName,
      modelSerializedOutput,
      {
        ...(Object.keys(packageVersions).length > 0 ? { packageVersions } : {}),
        terraformFolders: this.terraformService.getFolderRecords(),
        version: this.stateManagementService.stateVersion,
      },
    );
  }

  /**
   * This function persists the in-memory resource state.
   * The actual resource state is persisted as actual,
   * and the current resource state is persisted as old.
   *
   * @internal
   */
  private async saveResourceState(retainedFolders: TerraformFolderOutput[]): Promise<void> {
    const actualSerializedOutput = await this.resourceSerializationService.serializeActualResources();
    await this.stateManagementService.saveResourceState(
      this.stateManagementService.actualResourceStateFileName,
      actualSerializedOutput,
      {
        terraformFolders: [...this.terraformService.getFolderRecords(), ...retainedFolders],
        terraformResources: this.terraformService.getOctoTerraformResourceMappings().map(
          (m): TerraformResourceOutput => ({
            ...(m.destroyLosesData ? { destroyLosesData: true } : {}),
            ...(m.entireResponseOutput !== undefined ? { external: true } : {}),
            moduleId: m.moduleId,
            resourceContext: m.resourceContext,
            resourceId: m.resourceId,
            terraformAddresses: m.terraformAddresses,
          }),
        ),
        version: this.stateManagementService.stateVersion,
      },
    );

    const oldSerializedOutput = await this.resourceSerializationService.serializeNewResources();
    await this.stateManagementService.saveResourceState(
      this.stateManagementService.oldResourceStateFileName,
      oldSerializedOutput,
      {
        version: this.stateManagementService.stateVersion,
      },
    );
  }
}
