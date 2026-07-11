import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ActionOutputs,
  Constructable,
  GeneratorYieldType,
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
import { applyModelTransaction } from '../modes/apply-transaction.js';
import type { BaseAnchorSchema } from '../overlays/anchor.schema.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../overlays/overlay-data.repository.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
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
import { TerraformUtility } from '../utilities/terraform/terraform.utility.js';
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
    return DiffUtility.isObjectDeepEquals(resourcesActual.data, resourcesOld.data);
  }

  mapTransactionActions(transaction: DiffMetadata[][]): string[][] {
    return transaction.map((i) =>
      i.map((j) => j.actions.map((a: IModelAction<any> | IResourceAction<any>) => a.constructor.name)).flat(),
    );
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
   * This function tears down the *composed* graph (models, overlays, inputs, modules) at the end of a lifecycle
   * so the next `runModules()` composes fresh.
   */
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

  /**
   * Runs given modules against Octo to follow the complete lifecycle.
   *
   * The `terraformTarget` flag is the key here - it dictates how the lifecycle completes.
   * - 'skip' → calls commit() — pure in-memory model-graph apply.
   * - 'plan' → generate → terraformUtility.plan
   * - 'apply' → generate → terraformUtility.plan/apply → commit.
   */
  async *runModules<M extends UnknownModule>(
    app: UnknownModel,
    modules: TestModule<M> | TestModule<M>[],
    {
      filterByModuleIds = [],
      outputDir,
      terraformTarget = 'skip',
    }: { filterByModuleIds?: string[]; outputDir?: string; terraformTarget?: 'apply' | 'plan' | 'skip' } = {},
  ): AsyncGenerator<{
    app: UnknownModel;
    hclDiff: string;
    hclRender: string;
    modelTransaction: DiffMetadata[][];
    resourceDiffs: DiffMetadata[][];
    resourceTransaction: DiffMetadata[][];
    responses: { [resourceContext: string]: unknown };
    warnings: { message: string; moduleId?: string }[];
  }> {
    const [moduleContainer, resourceDataRepository, terraformService, terraformUtility] = await Promise.all([
      this.container.get(ModuleContainer),
      this.container.get(ResourceDataRepository),
      this.container.get(TerraformService),
      this.container.get(TerraformUtility),
    ]);

    // Load modules.
    const moduleList = Array.isArray(modules) ? modules : [modules];
    for (const module of moduleList) {
      if (moduleContainer.getMetadataIndex(module.type) === -1) {
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

    // Compose modules.
    moduleContainer.order(moduleList.map((m) => m.type));
    await this.octo.compose();

    const collectResponses = (): { [resourceContext: string]: unknown } =>
      Object.fromEntries(
        resourceDataRepository.getActualResourcesByProperties().map((r) => [r.getContext(), r.response]),
      );

    if (terraformTarget === 'skip') {
      // this.commit() applies the model graph exactly once and, before its internal reset, stores the
      // rendered desired state in `previousHcl`. Derive the render and block diff from that single
      // apply rather than a separate preview render — a preview would re-run model actions, and
      // non-idempotent ones (e.g. sibling associations) would then apply twice.
      const priorHcl = this.previousHcl ?? '';
      const transaction = await this.commit(app as App, { filterByModuleIds });
      const currentHcl = this.previousHcl ?? '';

      yield {
        app,
        hclDiff: HclUtility.diffBlocks(priorHcl, currentHcl),
        hclRender: currentHcl,
        modelTransaction: transaction.modelTransaction,
        resourceDiffs: transaction.resourceDiffs,
        resourceTransaction: transaction.resourceTransaction,
        responses: collectResponses(),
        warnings: [],
      };
      return;
    }

    // In production octo runs generate/validate/commit as three separate processes, each of which
    // derives the resource graph once from intent. runModules drives all three in one process, so it
    // builds the model transaction once and hands the same result to each mode.
    const transaction = await applyModelTransaction(app as App);

    // Generate.
    const dir = outputDir ?? (await mkdtemp(join(tmpdir(), 'octo-hcl-')));
    const resourceDiffs = await this.octo.generate(app as App, { outputDir: dir }, transaction);

    // Render the full HCL and the block diff from the sweep the transaction produced.
    const currentHcl = HclUtility.serialize(terraformService.renderAllModules());
    const diffHcl = HclUtility.diffBlocks(this.previousHcl ?? '', currentHcl);
    this.previousHcl = currentHcl;

    // Validate.
    const validation = await this.octo.validate(
      app as App,
      { plans: await terraformUtility.plan(dir, { json: true }) },
      transaction,
    );
    if (!validation.pass) {
      throw new Error(
        `runModules(): terraform plan failed octo validation:\n${validation.errors
          .map((error) => `${error.moduleId ? `[${error.moduleId}] ` : ''}${error.message}`)
          .join('\n')}`,
      );
    }

    const result: GeneratorYieldType<typeof this.runModules> = {
      app,
      hclDiff: diffHcl,
      hclRender: currentHcl,
      modelTransaction: [],
      resourceDiffs,
      resourceTransaction: [],
      responses: collectResponses(),
      warnings: [],
    };

    if (terraformTarget === 'plan') {
      yield result;
      return;
    }

    // Apply.
    await terraformUtility.apply(dir);

    // Commit.
    const { warnings } = await this.octo.commit(
      app as App,
      { outputs: await terraformUtility.output(dir, { json: true }) },
      transaction,
    );

    // Re-collect responses after the commit: it is commit that maps terraform outputs onto the
    // actual resource graph, so a snapshot taken before it (as `response` holds) would miss them.
    yield { ...result, responses: collectResponses(), warnings };
  }

  private async commit(
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

    // Each transaction sweeps the full resource graph into the terraform service, so the previous
    // call's sweep must be cleared first. Config and providers survive, as they would in a real
    // process — tests register them once (in beforeEach), not per transaction.
    terraformService.resetTransactionState();

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

    // Establish the HCL diff baseline from the same transaction that just applied the models, so the
    // next runModules() render reports its `diff` against the committed state. Captured before
    // reset(), which wipes the model attribution renderAllModules() depends on.
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
}
