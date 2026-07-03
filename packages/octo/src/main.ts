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
import { Container } from './functions/container/container.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { commit as runCommit } from './modes/commit.mode.js';
import { generate as runGenerate } from './modes/generate.mode.js';
import { runAction as runRunAction } from './modes/run-action.mode.js';
import { type TerraformPlan, validate as runValidate } from './modes/validate.mode.js';
import { ModuleContainer } from './modules/module.container.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from './overlays/overlay-data.repository.js';
import { InputService } from './services/input/input.service.js';
import { SchemaTranslationService } from './services/schema-translation/schema-translation.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import {
  StateManagementService,
  StateManagementServiceFactory,
} from './services/state-management/state-management.service.js';
import type { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TerraformService } from './services/terraform/terraform.service.js';

/**
 * @group Main
 */
export class Octo {
  private readonly modelStateFileName: string = 'models.json';
  private readonly actualResourceStateFileName: string = 'resources-actual.json';
  private readonly oldResourceStateFileName: string = 'resources-old.json';

  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private moduleContainer: ModuleContainer;
  private resourceSerializationService: ResourceSerializationService;
  private schemaTranslationService: SchemaTranslationService;
  private stateManagementService: StateManagementService;
  private terraformService: TerraformService;

  @EnableHook('CommitHook')
  private async commitTransaction(
    app: App,
    modelTransaction: DiffMetadata[][],
    resourceTransaction: DiffMetadata[][] = [],
  ): Promise<void> {
    // `modelTransaction` and `resourceTransaction` is used by hooks of type CommitHook.
    assert(!!modelTransaction);
    assert(!!resourceTransaction);

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  /**
   * Commits the result of a terraform apply back into octo's state.
   *
   * Delegates the tfstate → response mapping to the `commit` mode, then persists octo's state
   * (model + old + actual, with the octo→terraform mapping carried in the actual resource state).
   * All-or-nothing: the mode errors before mutating anything if an expected output is missing,
   * leaving state untouched. Outputs supplied for a folder octo does not track (not in intent or committed
   * state) are ignored — returned as warnings for the caller to surface.
   */
  async commit(
    ...args: Parameters<typeof runCommit>
  ): Promise<Pick<Awaited<ReturnType<typeof runCommit>>, 'warnings'>> {
    const { userData } = await this.stateManagementService.getResourceState(this.actualResourceStateFileName);
    const previousFolders = userData.terraformFolders ?? [];

    const { modelTransaction, warnings } = await runCommit(args[0], { ...args[1], previousFolders });
    await this.commitTransaction(args[0], modelTransaction, []);
    return { warnings };
  }

  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  /**
   * Generates terragrunt module folders representing the full desired state, and saves `models.json`
   * (the model graph, plus the terraform folder record of the folders this generate wrote).
   *
   * Folders recorded by the previous generate (`models.json`) or the last commit (`resources.json`)
   * that the current intent no longer fills are **emptied** — rewritten with their recorded provider
   * blocks and no resources — so a later apply destroys their live infrastructure instead of
   * orphaning it. Octo never deletes a folder.
   */
  async generate(app: App, options: { outputDir: string }): ReturnType<typeof runGenerate> {
    // The previous folder records must be read before this run writes the new `models.json`, so a
    // module deleted from intent is caught on the generate right after its removal.
    const [{ userData: modelUserData }, { userData: actualResourceUserData }] = await Promise.all([
      this.stateManagementService.getModelState(this.modelStateFileName),
      this.stateManagementService.getResourceState(this.actualResourceStateFileName),
    ]);
    const previousFolders = new Map<string, TerraformFolderOutput>();
    for (const record of [
      ...(actualResourceUserData.terraformFolders ?? []),
      ...(modelUserData.terraformFolders ?? []),
    ]) {
      previousFolders.set(record.moduleId, record);
    }

    const resourceDiffs = await runGenerate(app, { ...options, previousFolders: [...previousFolders.values()] });
    await this.saveModelState(app);
    return resourceDiffs;
  }

  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      type: Parameters<Container['get']>[0];
      options?: Parameters<Container['get']>[1];
    }[] = [],
    excludeInContainer: {
      type: Parameters<Container['unRegisterFactory']>[0];
    }[] = [],
  ): Promise<void> {
    const container = Container.getInstance();

    [
      this.inputService,
      this.modelSerializationService,
      this.moduleContainer,
      this.resourceSerializationService,
      this.schemaTranslationService,
      this.stateManagementService,
      this.terraformService,
    ] = await Promise.all([
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

    for (const exclude of excludeInContainer) {
      container.unRegisterFactory(exclude.type);
    }
    for (const initialize of initializeInContainer) {
      await container.get(initialize.type, initialize.options as any);
    }

    // Wait for all factories and startup promises to resolve.
    await container.waitToResolveAllFactories();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  loadModule<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: ModuleSchemaInputs<M>,
  ): void {
    this.moduleContainer.load(module, moduleId, inputs);
  }

  orderModules(...args: Parameters<ModuleContainer['order']>): ReturnType<ModuleContainer['order']> {
    this.moduleContainer.order(...args);
  }

  registerHooks(...args: Parameters<ModuleContainer['registerHooks']>): ReturnType<ModuleContainer['registerHooks']> {
    this.moduleContainer.registerHooks(...args);
  }

  registerSchemaTranslation(
    ...args: Parameters<SchemaTranslationService['registerSchemaTranslation']>
  ): ReturnType<SchemaTranslationService['registerSchemaTranslation']> {
    return this.schemaTranslationService.registerSchemaTranslation(...args);
  }

  registerTags(
    args: { scope: { moduleId?: string; resourceContext?: string }; tags: { [key: string]: string } }[],
  ): void {
    for (const { scope, tags } of args) {
      const isGlobal = !scope.moduleId && !scope.resourceContext;
      this.inputService.registerTag((isGlobal || scope) as Parameters<InputService['registerTag']>[0], tags);
    }
  }

  /**
   * Sets the minimum terraform version and the `required_providers` sources/versions rendered
   * into every generated module folder. Call after `initialize()`, before `generate()`.
   */
  registerTerraformConfig(
    ...args: Parameters<TerraformService['addTerraformConfig']>
  ): ReturnType<TerraformService['addTerraformConfig']> {
    return this.terraformService.addTerraformConfig(...args);
  }

  /**
   * Registers a terraform provider block for a deployment target (provider type + account +
   * region). Resources bind to providers by `{ accountId, regionId }` alone — registration is
   * the one place a provider type is named. Call after `initialize()`, before `generate()`.
   */
  registerTerraformProvider(
    ...args: Parameters<TerraformService['addTerraformProvider']>
  ): ReturnType<TerraformService['addTerraformProvider']> {
    return this.terraformService.addTerraformProvider(...args);
  }

  private async retrieveResourceState(): Promise<void> {
    const { data: actualSerializedOutput } = await this.stateManagementService.getResourceState(
      this.actualResourceStateFileName,
    );
    const { data: oldSerializedOutput } = await this.stateManagementService.getResourceState(
      this.oldResourceStateFileName,
    );

    // Initialize previous resource state.
    await this.resourceSerializationService.deserialize(actualSerializedOutput, oldSerializedOutput);
  }

  /**
   * Runs a single resource action, invoked by terraform mid-apply for an external resource.
   * See the `runAction` mode.
   */
  async runAction(
    app: App,
    options: { inputs?: Record<string, unknown>; resourceId: string },
  ): ReturnType<typeof runRunAction> {
    return runRunAction(app, options);
  }

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      terraformFolders: this.terraformService.getFolderRecords(),
      version: 1,
    });

    await Container.getInstance().get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      { args: [true] },
    );
  }

  /**
   * The actual (committed) resource state also carries the terraform memory of the last apply: the
   * folder record of the committed folders, and each resource's terraform addresses — so a later
   * generate can empty a deleted module's folder, and a later validate can verify its destroys.
   */
  private async saveResourceState(): Promise<void> {
    const actualSerializedOutput = await this.resourceSerializationService.serializeActualResources();
    await this.stateManagementService.saveResourceState(this.actualResourceStateFileName, actualSerializedOutput, {
      terraformFolders: this.terraformService.getFolderRecords(),
      terraformResources: this.terraformService.getOctoTerraformResourceMappings().map(
        (m): TerraformResourceOutput => ({
          moduleId: m.moduleId,
          resourceContext: m.resourceContext,
          resourceId: m.resourceId,
          terraformAddresses: m.terraformAddresses,
        }),
      ),
      version: 1,
    });

    const oldSerializedOutput = await this.resourceSerializationService.serializeNewResources();
    await this.stateManagementService.saveResourceState(this.oldResourceStateFileName, oldSerializedOutput, {
      version: 1,
    });
  }

  /**
   * Validates the generated terraform plans against octo's resource diff.
   *
   * Also reads the terraform memory persisted by the last commit (in the actual resource state):
   * the octo→terraform mapping keyed by resource context, and the committed folder record used to
   * recognize emptied folders and folders octo does not track. Both empty when nothing has been committed yet.
   */
  async validate(app: App, { plans }: { plans: Map<string, TerraformPlan> }): ReturnType<typeof runValidate> {
    const { userData } = await this.stateManagementService.getResourceState(this.actualResourceStateFileName);
    const { terraformFolders, terraformResources } = userData;

    const persistedMappings = new Map<string, TerraformResourceOutput>();
    for (const mapping of terraformResources ?? []) {
      persistedMappings.set(mapping.resourceContext, mapping);
    }

    return runValidate(app, { persistedMappings, plans, previousFolders: terraformFolders ?? [] });
  }
}
