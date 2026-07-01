import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ActionOutputs,
  Constructable,
  ModuleOutput,
  ModuleSchemaInputs,
  UnknownAnchor,
  UnknownModel,
  UnknownModule,
} from '../app.type.js';
import { type Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { Octo } from '../main.js';
import type { App } from '../models/app/app.model.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { AModel } from '../models/model.abstract.js';
import type { BaseAnchorSchema } from '../overlays/anchor.schema.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../overlays/overlay-data.repository.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { AResource } from '../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService, type InputServiceFactory } from '../services/input/input.service.js';
import { LocalEncryptionStateProvider } from '../services/state-management/local-encryption.state-provider.js';
import { LocalStateProvider } from '../services/state-management/local.state-provider.js';
import { StateManagementService } from '../services/state-management/state-management.service.js';
import type { IStateProvider } from '../services/state-management/state-provider.interface.js';
import { TestStateProvider } from '../services/state-management/test.state-provider.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { HclUtility } from '../utilities/hcl/hcl.utility.js';
import { TestAnchor } from '../utilities/test-helpers/test-classes.js';
import { create } from '../utilities/test-helpers/test-models.js';
import { createTestOverlays } from '../utilities/test-helpers/test-overlays.js';
import { createResources, createTestResources } from '../utilities/test-helpers/test-resources.js';
import { AModule } from './module.abstract.js';
import { ModuleContainer } from './module.container.js';

// Universal Test Module and Actions.
class UniversalTestModuleSchema {}
class UniversalTestModule extends AModule<UniversalTestModuleSchema, any> {
  static override readonly MODULE_PACKAGE = '@octo';
  static override readonly MODULE_SCHEMA = UniversalTestModuleSchema;

  async onInit(): Promise<void> {
    return;
  }
}
class UniversalModelAction implements IModelAction<UniversalTestModule> {
  filter(): boolean {
    return true;
  }
  async handle(): Promise<ActionOutputs> {
    return {};
  }
}
class UniversalResourceAction implements IResourceAction<any> {
  filter(): boolean {
    return true;
  }
  async handle(): Promise<void> {}
}

/**
 * @group Modules
 */
export type TestModule<M extends UnknownModule> = {
  hidden?: boolean;
  inputs: ModuleSchemaInputs<M>;
  moduleId: string;
  type: Constructable<M>;
};

/**
 * @group Modules
 */
export class TestModuleContainer {
  private readonly container: Container;
  private readonly octo: Octo;
  private previousHcl: string | undefined;
  private stateProvider: IStateProvider;

  constructor(container: Container) {
    this.container = container;
    this.octo = new Octo();
  }

  async commit(
    app: App,
    {
      filterByModuleIds = [],
      skipResourceTransaction = false,
    }: {
      filterByModuleIds?: string[];
      skipResourceTransaction?: boolean;
    } = {},
  ): Promise<{
    modelDiffs: DiffMetadata[][];
    modelTransaction: DiffMetadata[][];
    resourceDiffs: DiffMetadata[][];
    resourceTransaction: DiffMetadata[][];
  }> {
    const [terraformService, transactionService] = await Promise.all([
      this.container.get(TerraformService),
      this.container.get(TransactionService),
    ]);
    const diffs = await app.diff();
    const generator = transactionService.beginTransaction(diffs, {
      generateTerraform: true,
      yieldModelDiffs: true,
      yieldModelTransaction: true,
      yieldResourceDiffs: true,
      yieldResourceTransaction: true,
    });

    const response = {} as Awaited<ReturnType<TestModuleContainer['commit']>>;

    try {
      response.modelDiffs = (await generator.next()).value;
      response.modelTransaction = (await generator.next()).value;
      response.resourceDiffs = (await generator.next()).value;
      if (!skipResourceTransaction) {
        response.resourceTransaction = (await generator.next()).value;
        await generator.next();
      } else {
        response.resourceTransaction = [];
      }
    } catch (error) {
      await this.reset();
      throw error;
    }

    if (!skipResourceTransaction) {
      await this.octo['commitTransaction'](app, response.modelTransaction, response.resourceTransaction);
    }

    // Establish the HCL diff baseline from the same transaction that just applied the models, so a
    // later diffHcl() reports what changed against the committed state. Captured before reset(),
    // which wipes the model attribution renderAllModules() depends on.
    this.previousHcl = HclUtility.serialize(terraformService.renderAllModules());

    const inputService = await this.container.get(InputService);

    for (const moduleId of filterByModuleIds) {
      response.modelDiffs = response.modelDiffs
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AModel && !(j.node instanceof AOverlay)) {
              return inputService.getModuleIdFromModel(j.node) === moduleId;
            } else if (j.node instanceof AOverlay) {
              return inputService.getModuleIdFromOverlay(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      response.modelTransaction = response.modelTransaction
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AModel && !(j.node instanceof AOverlay)) {
              return inputService.getModuleIdFromModel(j.node) === moduleId;
            } else if (j.node instanceof AOverlay) {
              return inputService.getModuleIdFromOverlay(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      response.resourceDiffs = response.resourceDiffs
        .map((i) =>
          i.filter((j) => {
            if (j.node instanceof AResource) {
              return inputService.getModuleIdFromResource(j.node) === moduleId;
            } else {
              return false;
            }
          }),
        )
        .filter((i) => i.length);

      if (!skipResourceTransaction) {
        response.resourceTransaction = response.resourceTransaction
          .map((i) =>
            i.filter((j) => {
              if (j.node instanceof AResource) {
                return inputService.getModuleIdFromResource(j.node) === moduleId;
              } else {
                return false;
              }
            }),
          )
          .filter((i) => i.length);
      }
    }

    await this.reset();

    return response;
  }

  async createResources(
    moduleId: string,
    args: Parameters<typeof createResources>[0],
    options?: Parameters<typeof createResources>[1],
  ): Promise<ReturnType<typeof createResources>> {
    const [inputService, moduleContainer] = await Promise.all([
      this.container.get(InputService),
      this.container.get(ModuleContainer),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = await createResources(args, options);
    for (const resource of Object.values(result)) {
      inputService.registerResource(moduleId, resource);
    }

    return result;
  }

  createTestAnchor<S extends BaseAnchorSchema & { parentInstance: UnknownModel }>(
    anchorId: string,
    properties: S['properties'],
    parent: S['parentInstance'],
  ): UnknownAnchor {
    return new TestAnchor(anchorId, properties, parent);
  }

  async createTestModels(moduleId: string, args: Parameters<typeof create>[0]): Promise<ReturnType<typeof create>> {
    const container = this.container;
    const [inputService, moduleContainer, transactionService] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
      container.get(TransactionService),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    const result = create(args);
    for (const models of Object.values(result)) {
      for (const model of models) {
        // Skip models that are already registered (a defined moduleId means it is known).
        if (inputService.getModuleIdFromModel(model) !== undefined) {
          continue;
        }

        inputService.registerModel(moduleId, model);

        const universalAction = new UniversalModelAction();
        Object.assign(universalAction, {
          constructor: { name: `${UniversalModelAction.name}For${model.constructor.name}` },
        });
        try {
          transactionService.unregisterModelActions(model.constructor as Constructable<UnknownModel>);
          transactionService.registerModelActions(model.constructor as Constructable<UnknownModel>, [universalAction]);
        } catch (error) {
          if (
            error.message !==
            `Action "${universalAction.constructor.name}" already registered for model "${model.constructor.name}"!`
          ) {
            throw error;
          }
        }
      }
    }

    return result;
  }

  async createTestOverlays(
    moduleId: string,
    args: Parameters<typeof createTestOverlays>[0],
  ): Promise<ReturnType<typeof createTestOverlays>> {
    const container = this.container;
    const [inputService, moduleContainer] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    // Default any overlay without explicit actions to a universal no-op action, named after the
    // overlay so it reads clearly in a transaction snapshot. createTestOverlays registers them.
    for (const arg of args) {
      if (!arg.overlayActions || arg.overlayActions.length === 0) {
        const [, nodeName] = arg.context.split('=')[0].split('/');
        const universalAction = new UniversalModelAction();
        Object.assign(universalAction, {
          constructor: { name: `${UniversalModelAction.name}For${nodeName}` },
        });
        arg.overlayActions = [universalAction];
      }
    }

    const result = await createTestOverlays(args);
    for (const overlay of Object.values(result)) {
      inputService.registerOverlay(moduleId, overlay);
    }

    return result;
  }

  async createTestResources<S extends BaseResourceSchema[]>(
    moduleId: string,
    args: Parameters<typeof createTestResources<S>>[0],
    options?: Parameters<typeof createTestResources>[1],
  ): Promise<ReturnType<typeof createTestResources<S>>> {
    const container = this.container;
    const [inputService, moduleContainer] = await Promise.all([
      container.get(InputService),
      container.get(ModuleContainer),
    ]);

    // Register new moduleId as instance of the universal module.
    moduleContainer.load(UniversalTestModule, moduleId, {});
    // Immediately unload the universal module to ensure it does not run in apply().
    moduleContainer.unload(UniversalTestModule);

    // Default any resource without explicit actions to a universal no-op action, named after the
    // resource so it reads clearly in a transaction snapshot. createTestResources registers them,
    // and skips terraform resources (which terraform owns and cannot have actions).
    for (const arg of args) {
      if (!arg.resourceActions || arg.resourceActions.length === 0) {
        const [, nodeName] = arg.resourceContext.split('=')[0].split('/');
        const universalAction = new UniversalResourceAction();
        Object.assign(universalAction, {
          constructor: { name: `${UniversalResourceAction.name}For${nodeName}` },
        });
        arg.resourceActions = [universalAction];
      }
    }

    const result = await createTestResources(args, options);
    for (const resource of Object.values(result)) {
      inputService.registerResource(moduleId, resource);
    }

    return result;
  }

  /**
   * Renders the desired-state terraform for `app` and returns a block-level diff against the
   * previous render in this test (from an earlier {@link renderHcl} or {@link diffHcl} call), ready
   * to snapshot. Returns `'<no changes>'` when nothing moved.
   */
  async diffHcl(app: App): Promise<string> {
    const current = await this.renderCurrentHcl(app);
    const diff = HclUtility.diffBlocks(this.previousHcl ?? '', current);
    this.previousHcl = current;
    return diff;
  }

  /**
   * Reduces a transaction's diffs (resource or model) to a stable, snapshot-friendly digest:
   * `+ <context>` (create), `- <context>` (delete), `^ <context>` (replace), `* <context>` (update).
   * Folds in the former standalone `DiffAssert` — everything a test needs lives on this container.
   */
  digestDiffs(diffs: DiffMetadata[][]): string[] {
    const changes: string[] = [];
    for (const d of diffs.flat()) {
      if (d.action === DiffAction.ADD && d.field === 'resourceId') {
        changes.push(`+ ${d.node.getContext()}`);
      } else if (d.action === DiffAction.DELETE && d.field === 'resourceId') {
        changes.push(`- ${d.node.getContext()}`);
      } else if (d.action === DiffAction.REPLACE && d.field === 'resourceId') {
        changes.push(`^ ${d.node.getContext()}`);
      } else if (d.action === DiffAction.UPDATE) {
        changes.push(`* ${d.node.getContext()}`);
      }
    }
    return changes;
  }

  /**
   * Generates the full desired-state terraform for `app` to disk as standalone, executable terragrunt
   * module folders — one per octo module (`main.tf`, `variables.tf`, `outputs.tf`, `terragrunt.hcl`).
   * The same output an end user gets from `octo run-action`, so a module author can point real
   * `terraform`/`terragrunt` at it and validate their piece against the provider — the one check octo
   * deliberately does not do itself.
   *
   * Cross-module references emit terragrunt `dependency` blocks with `mock_outputs` (and
   * `mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]`), so
   * `terragrunt run-all validate` / `plan` should succeed even though the upstream modules a developer would
   * normally supply are absent. The boundary is mocked from exactly what this module consumes.
   *
   * Rendering throws if the terraform is internally inconsistent — a reference to a resource or
   * output that nothing produces, or a cross-module dependency cycle.
   *
   * Persists nothing to octo state — safe to call before {@link commit} and to call repeatedly.
   *
   * @param app - the composed app to render.
   * @param outputDir - where to write the folders. Defaults to a fresh temp directory (returned in
   *   the result). The directory is octo-owned: it is wiped and regenerated on every call.
   * @returns the directory written to, and the resource diffs that produced it (a review artifact).
   */
  async generateHcl(
    app: App,
    { outputDir }: { outputDir?: string } = {},
  ): Promise<{ outputDir: string; resourceDiffs: DiffMetadata[][] }> {
    const dir = outputDir ?? (await mkdtemp(join(tmpdir(), 'octo-hcl-')));
    const resourceDiffs = await this.octo.generate(app, { outputDir: dir });
    return { outputDir: dir, resourceDiffs };
  }

  async initialize(
    stateProvider?: IStateProvider,
    initializeInContainer?: Parameters<typeof Octo.prototype.initialize>[1],
    excludeInContainer?: Parameters<typeof Octo.prototype.initialize>[2],
  ): Promise<void> {
    if (
      stateProvider &&
      !(
        stateProvider instanceof LocalEncryptionStateProvider ||
        stateProvider instanceof LocalStateProvider ||
        stateProvider instanceof TestStateProvider
      )
    ) {
      throw new Error('TestModuleContainer is only meant to work with LocalEncryption, Local, or Test state provider!');
    }
    this.stateProvider = stateProvider ?? new TestStateProvider();
    await this.octo.initialize(this.stateProvider, initializeInContainer, excludeInContainer);

    // Always register the UniversalTestModule to allow users to create test prerequisites.
    const moduleContainer = await this.container.get(ModuleContainer);
    moduleContainer.register(UniversalTestModule, { packageName: '@octo' });
  }

  async isResourceStateEqual(): Promise<boolean> {
    const container = this.container;
    const stateManagementService = await container.get(StateManagementService);
    const resourcesActual = await stateManagementService.getResourceState('resources-actual.json');
    const resourcesOld = await stateManagementService.getResourceState('resources-old.json');
    return DiffUtility.isObjectDeepEquals(resourcesActual, resourcesOld);
  }

  mapTransactionActions(transaction: DiffMetadata[][]): string[][] {
    return transaction.map((i) =>
      i.map((j) => j.actions.map((a: IModelAction<any> | IResourceAction<any>) => a.constructor.name)).flat(),
    );
  }

  async orderModules(modules: (Constructable<UnknownModule> | string)[]): Promise<void> {
    const moduleContainer = await this.container.get(ModuleContainer);
    moduleContainer.order(modules);
  }

  registerHooks(...args: Parameters<Octo['registerHooks']>): ReturnType<Octo['registerHooks']> {
    return this.octo.registerHooks(...args);
  }

  registerTags(...args: Parameters<Octo['registerTags']>): ReturnType<Octo['registerTags']> {
    return this.octo.registerTags(...args);
  }

  registerTerraformConfig(
    ...args: Parameters<Octo['registerTerraformConfig']>
  ): ReturnType<Octo['registerTerraformConfig']> {
    return this.octo.registerTerraformConfig(...args);
  }

  registerTerraformProvider(
    ...args: Parameters<Octo['registerTerraformProvider']>
  ): ReturnType<Octo['registerTerraformProvider']> {
    return this.octo.registerTerraformProvider(...args);
  }

  /**
   * Runs the generate sweep for `app` and serializes the rendered terragrunt folders to a single
   * deterministic string. Does not touch the stored previous render — callers manage that.
   *
   * @internal
   */
  private async renderCurrentHcl(app: App): Promise<string> {
    const container = this.container;
    const [terraformService, transactionService] = await Promise.all([
      container.get(TerraformService),
      container.get(TransactionService),
    ]);

    const diffs = await app.diff();
    const transaction = transactionService.beginTransaction(diffs, {
      generateTerraform: true,
      yieldResourceDiffs: true,
    });
    // Drains the resource-diff yield; the contribution to TerraformService happens as a side effect.
    await transaction.next();

    return HclUtility.serialize(terraformService.renderAllModules());
  }

  /**
   * Renders the full desired-state terraform for `app` in memory (no filesystem) as a single
   * deterministic string, suitable for a full-tree snapshot. Advances the internal "previous"
   * render, so a later {@link diffHcl} call reports what changed since this one.
   *
   * Contributes resources to {@link TerraformService} and renders, but persists nothing to octo
   * state — safe to call before {@link commit}. Throws if the terraform is internally inconsistent
   * (a reference to a resource/output nothing produces, or a cross-module cycle).
   */
  async renderHcl(app: App): Promise<string> {
    const current = await this.renderCurrentHcl(app);
    this.previousHcl = current;
    return current;
  }

  async reset(): Promise<void> {
    const container = this.container;

    // Reset ModuleContainer constructor injections.
    await container.get<InputService, typeof InputServiceFactory>(InputService, { args: [true] });
    await container.get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(OverlayDataRepository, {
      args: [true, []],
    });

    // Reset module container.
    const moduleContainer = await container.get(ModuleContainer);
    moduleContainer.reset();
  }

  async runModule<M extends UnknownModule>(module: TestModule<M>): Promise<{ [key: string]: ModuleOutput<M> }> {
    const moduleContainer = await this.container.get(ModuleContainer);

    const moduleMetadataIndex = moduleContainer.getMetadataIndex(module.type);
    if (moduleMetadataIndex === -1) {
      moduleContainer.register(module.type, { packageName: (module.type as unknown as typeof AModule).MODULE_PACKAGE });
    }

    const moduleMetadata = moduleContainer.getMetadata(module.type)!;
    if (module.hidden === true) {
      moduleContainer.unload(moduleMetadata.module);
    } else {
      moduleContainer.load(moduleMetadata.module, module.moduleId, module.inputs);
    }

    return (await this.octo.compose()) as { [key: string]: ModuleOutput<M> };
  }

  async runModules<M extends UnknownModule>(modules: TestModule<M>[]): Promise<{ [key: string]: ModuleOutput<M> }> {
    const moduleContainer = await this.container.get(ModuleContainer);

    for (const module of modules) {
      const moduleMetadataIndex = moduleContainer.getMetadataIndex(module.type);
      if (moduleMetadataIndex === -1) {
        moduleContainer.register(module.type, {
          packageName: (module.type as unknown as typeof AModule).MODULE_PACKAGE,
        });
      }

      const moduleMetadata = moduleContainer.getMetadata(module.type)!;
      if (module.hidden === true) {
        moduleContainer.unload(moduleMetadata.module);
      } else {
        moduleContainer.load(moduleMetadata.module, module.moduleId, module.inputs);
      }
    }

    return (await this.octo.compose()) as { [key: string]: ModuleOutput<M> };
  }
}
