import { strict as assert } from 'assert';
import type { Constructable, ModuleSchemaInputs, UnknownModule, UnknownResource } from './app.type.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import { Container } from './functions/container/container.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { commit as runCommit } from './modes/commit.mode.js';
import { generate as runGenerate } from './modes/generate.mode.js';
import { runAction as runRunAction } from './modes/run-action.mode.js';
import { type PersistedTerraformMapping, validate as runValidate } from './modes/validate.mode.js';
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
  private readonly terraformMappingStateFileName: string = 'terraform-mapping.json';

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
   * (model + old + actual) and the octo→terraform mapping. All-or-nothing: the mode errors before
   * mutating anything if an expected output is missing, leaving state untouched.
   */
  async commit(app: App, { tfDir }: { tfDir: string }): Promise<void> {
    const { modelTransaction } = await runCommit(app, { tfDir });
    await this.saveTerraformMapping();
    await this.commitTransaction(app, modelTransaction, []);
  }

  async compose(): Promise<{ [key: string]: unknown }> {
    return await this.moduleContainer.apply();
  }

  /**
   * Generates terragrunt module folders representing the full desired state.
   */
  async generate(app: App, options: { outputDir: string }): ReturnType<typeof runGenerate> {
    return runGenerate(app, options);
  }

  getModule<M extends UnknownModule>(...args: Parameters<InputService['getModule']>): M | undefined {
    return this.inputService.getModule(...args);
  }

  getModuleResources(...args: Parameters<InputService['getModuleResources']>): UnknownResource[] {
    return this.inputService.getModuleResources(...args);
  }

  /**
   * Reads the octo→terraform mapping persisted by the last commit, keyed by resource context.
   * Returns an empty map when nothing has been committed yet.
   */
  private async getPersistedTerraformMappings(): Promise<Map<string, PersistedTerraformMapping>> {
    const result = new Map<string, PersistedTerraformMapping>();

    let content: string;
    try {
      const buffer = await this.stateManagementService.getState(this.terraformMappingStateFileName);
      content = buffer.toString();
    } catch (error) {
      if (error.message === 'No state found!') {
        return result;
      }
      throw error;
    }

    const parsed = JSON.parse(content) as { data: PersistedTerraformMapping[] };
    for (const mapping of parsed.data ?? []) {
      result.set(mapping.resourceContext, mapping);
    }
    return result;
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
      version: 1,
    });

    await Container.getInstance().get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      { args: [true] },
    );
  }

  private async saveResourceState(): Promise<void> {
    const actualSerializedOutput = await this.resourceSerializationService.serializeActualResources();
    await this.stateManagementService.saveResourceState(this.actualResourceStateFileName, actualSerializedOutput, {
      version: 1,
    });

    const oldSerializedOutput = await this.resourceSerializationService.serializeNewResources();
    await this.stateManagementService.saveResourceState(this.oldResourceStateFileName, oldSerializedOutput, {
      version: 1,
    });
  }

  /**
   * Persists the current octo→terraform mapping so a later validate can recover the addresses of
   * resources that get deleted afterwards. Written only on a successful commit (last-applied state).
   */
  private async saveTerraformMapping(): Promise<void> {
    const mappings = this.terraformService.getOctoTerraformResourceMappings();
    const data: PersistedTerraformMapping[] = mappings.map((m) => ({
      moduleId: m.moduleId,
      resourceContext: m.resourceContext,
      resourceId: m.resourceId,
      terraformAddresses: m.terraformAddresses,
    }));
    await this.stateManagementService.saveState(
      this.terraformMappingStateFileName,
      Buffer.from(JSON.stringify({ data })),
    );
  }

  /**
   * Validates the generated terraform plans against octo's resource diff.
   */
  async validate(app: App, { tfDir }: { tfDir: string }): ReturnType<typeof runValidate> {
    const persistedMappings = await this.getPersistedTerraformMappings();
    return runValidate(app, { persistedMappings, tfDir });
  }
}
