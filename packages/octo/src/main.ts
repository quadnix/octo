import { strict as assert } from 'assert';
import { ActionInputs, Constructable, TransactionOptions, UnknownResource } from './app.type.js';
import { ValidationTransactionError } from './errors/index.js';
import { Container } from './functions/container/container.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { ModuleContainer } from './modules/module.container.js';
import { IModule } from './modules/module.interface.js';
import { OverlayDataRepository } from './overlays/overlay-data.repository.js';
import { ResourceDataRepository } from './resources/resource-data.repository.js';
import { AResource } from './resources/resource.abstract.js';
import { CaptureService } from './services/capture/capture.service.js';
import { InputService } from './services/input/input.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import { StateManagementService } from './services/state-management/state-management.service.js';
import { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TransactionService } from './services/transaction/transaction.service.js';
import { ValidationService } from './services/validation/validation.service.js';

export class Octo {
  private readonly modelStateFileName: string = 'models.json';
  private readonly actualResourceStateFileName: string = 'resources-actual.json';
  private readonly oldResourceStateFileName: string = 'resources-old.json';

  private captureService: CaptureService;
  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private moduleContainer: ModuleContainer;
  private resourceDataRepository: ResourceDataRepository;
  private resourceSerializationService: ResourceSerializationService;
  private stateManagementService: StateManagementService;
  private transactionService: TransactionService;
  private validationService: ValidationService;

  async *beginTransaction(
    app: App,
    {
      enableResourceCapture = false,
      yieldModelDiffs = false,
      yieldModelTransaction = false,
      yieldResourceDiffs = false,
      yieldResourceTransaction = false,
    }: TransactionOptions = {},
  ): ReturnType<TransactionService['beginTransaction']> {
    const diffs = await app.diff();
    const transaction = this.transactionService.beginTransaction(diffs, {
      enableResourceCapture,
      yieldModelDiffs: true,
      yieldModelTransaction: true,
      yieldResourceDiffs: true,
      yieldResourceTransaction: true,
    });

    const modelDiffs = await transaction.next();
    if (yieldModelDiffs) {
      yield modelDiffs.value;
    }

    const modelTransaction = await transaction.next();
    if (yieldModelTransaction) {
      yield modelTransaction.value;
    }

    const resourceDiffs = await transaction.next();
    if (yieldResourceDiffs) {
      yield resourceDiffs.value;
    }

    let resourceTransaction:
      | IteratorYieldResult<DiffMetadata[][]>
      | IteratorReturnResult<DiffMetadata[][]>
      | undefined = undefined;
    try {
      resourceTransaction = await transaction.next();
      if (yieldResourceTransaction) {
        yield resourceTransaction.value;
      }

      return (await transaction.next()).value;
    } finally {
      await this.commitTransaction(app, modelTransaction.value, resourceTransaction ? resourceTransaction.value : []);
    }
  }

  @EnableHook('CommitHook')
  private async commitTransaction(
    app: App,
    modelTransaction: DiffMetadata[][],
    resourceTransaction: DiffMetadata[][] = [],
  ): Promise<void> {
    // `modelTransaction` is used by hooks of type CommitHook.
    assert(!!modelTransaction);
    assert(!!resourceTransaction);

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  async compose(): Promise<void> {
    await this.moduleContainer.apply();

    const result = this.validationService.validate();
    if (!result.pass) {
      throw new ValidationTransactionError('Validation error!', result);
    }
  }

  getAllResources(): UnknownResource[] {
    return this.resourceDataRepository.getNewResourcesByProperties();
  }

  getModuleOutput<T>(module: Constructable<IModule<T>> | string): T | undefined {
    return this.moduleContainer.getOutput(module);
  }

  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      type: Parameters<typeof Container.get>[0];
      options?: Parameters<typeof Container.get>[1];
    }[] = [],
    excludeInContainer: {
      type: Parameters<typeof Container.unRegisterFactory>[0];
    }[] = [],
  ): Promise<void> {
    [
      this.captureService,
      this.inputService,
      this.modelSerializationService,
      this.moduleContainer,
      this.resourceDataRepository,
      this.resourceSerializationService,
      this.stateManagementService,
      this.transactionService,
      this.validationService,
    ] = await Promise.all([
      Container.get(CaptureService),
      Container.get(InputService),
      Container.get(ModelSerializationService),
      Container.get(ModuleContainer),
      Container.get(ResourceDataRepository),
      Container.get(ResourceSerializationService),
      Container.get(StateManagementService, { args: [true, stateProvider] }),
      Container.get(TransactionService),
      Container.get(ValidationService),
    ]);

    for (const exclude of excludeInContainer) {
      Container.unRegisterFactory(exclude.type);
    }
    for (const initialize of initializeInContainer) {
      await Container.get(initialize.type, initialize.options);
    }

    // Wait for all factories and startup promises to resolve.
    await Container.waitToResolveAllFactories();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
  }

  loadModules(modules: Constructable<IModule<any>>[]): void {
    for (const module of modules) {
      this.moduleContainer.load(module);
    }
  }

  registerCapture<T extends AResource<T>>(resourceId: T['resourceId'], response: Partial<T['response']>): void {
    this.captureService.registerCapture(resourceId, response);
  }

  registerInputs(inputs: ActionInputs): void {
    this.inputService.registerInputs(inputs);
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

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      version: 1,
    });

    await Container.get(OverlayDataRepository, { args: [true] });
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
}
