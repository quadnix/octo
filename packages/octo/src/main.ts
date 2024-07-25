import { strict as assert } from 'assert';
import { ActionInputs, Constructable, TransactionOptions, UnknownResource } from './app.type.js';
import { Container } from './decorators/container.js';
import { EnableHook } from './decorators/enable-hook.decorator.js';
import { DiffMetadata } from './functions/diff/diff-metadata.js';
import { App } from './models/app/app.model.js';
import { ModuleContainer } from './modules/module.container.js';
import { IModule } from './modules/module.interface.js';
import { ResourceDataRepository } from './resources/resource-data.repository.js';
import { AResource } from './resources/resource.abstract.js';
import { CaptureService } from './services/capture/capture.service.js';
import { InputService } from './services/input/input.service.js';
import { ModelSerializationService } from './services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from './services/serialization/resource/resource-serialization.service.js';
import { StateManagementService } from './services/state-management/state-management.service.js';
import { IStateProvider } from './services/state-management/state-provider.interface.js';
import { TransactionService } from './services/transaction/transaction.service.js';

export class Octo {
  private readonly modelStateFileName: string = 'models.json';
  private readonly resourceStateFileName: string = 'resources.json';

  private previousApp: App | undefined;

  private captureService: CaptureService;
  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private resourceDataRepository: ResourceDataRepository;
  private resourceSerializationService: ResourceSerializationService;
  private stateManagementService: StateManagementService;
  private transactionService: TransactionService;

  async beginTransaction(
    app: App,
    options?: TransactionOptions,
  ): Promise<ReturnType<TransactionService['beginTransaction']>> {
    const diffs = await app.diff(this.previousApp);
    return this.transactionService.beginTransaction(diffs, options || {});
  }

  @EnableHook('CommitHook')
  async commitTransaction(app: App, modelTransaction: DiffMetadata[][]): Promise<void> {
    // `modelTransaction` is used by hooks of type CommitHook.
    assert(!!modelTransaction);

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
    this.previousApp = await this.retrieveModelState();
  }

  async compose(): Promise<void> {
    const moduleContainer = await Container.get(ModuleContainer);
    await moduleContainer.apply();
  }

  getAllResources(): UnknownResource[] {
    return this.resourceDataRepository.getByProperties();
  }

  async getModuleOutput<T>(module: Constructable<IModule<T>> | string): Promise<T | undefined> {
    const moduleContainer = await Container.get(ModuleContainer);
    return moduleContainer.getOutput(module);
  }

  async initialize(
    stateProvider: IStateProvider,
    initializeInContainer: {
      type: Parameters<typeof Container.get>[0];
      options: Parameters<typeof Container.get>[1];
    }[] = [],
    excludeInContainer: {
      type: Parameters<typeof Container.unregisterFactory>[0];
    }[] = [],
  ): Promise<void> {
    [
      this.captureService,
      this.inputService,
      this.modelSerializationService,
      this.resourceDataRepository,
      this.resourceSerializationService,
      this.stateManagementService,
      this.transactionService,
    ] = await Promise.all([
      Container.get(CaptureService),
      Container.get(InputService),
      Container.get(ModelSerializationService),
      Container.get(ResourceDataRepository),
      Container.get(ResourceSerializationService),
      Container.get(StateManagementService, { args: [stateProvider] }),
      Container.get(TransactionService),
    ]);

    for (const exclude of excludeInContainer) {
      Container.unregisterFactory(exclude.type);
    }
    for (const initialize of initializeInContainer) {
      await Container.get(initialize.type, initialize.options);
    }

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
    this.previousApp = await this.retrieveModelState();
  }

  registerCapture<T extends AResource<T>>(
    resourceId: T['resourceId'],
    properties: Partial<T['properties']>,
    response: Partial<T['response']>,
  ): void {
    this.captureService.registerCapture(resourceId, properties, response);
  }

  registerInputs(inputs: ActionInputs): void {
    this.inputService.registerInputs(inputs);
  }

  private async retrieveModelState(): Promise<App | undefined> {
    const { data: modelSerializedOutput } = await this.stateManagementService.getModelState(this.modelStateFileName);

    // Initialize previous model state.
    return Object.keys(modelSerializedOutput.models).length > 0
      ? ((await this.modelSerializationService.deserialize(modelSerializedOutput)) as App)
      : undefined;
  }

  private async retrieveResourceState(): Promise<void> {
    const { data: resourceSerializedOutput } = await this.stateManagementService.getResourceState(
      this.resourceStateFileName,
    );

    // Initialize previous resource state.
    await this.resourceSerializationService.deserialize(resourceSerializedOutput);
  }

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      version: 1,
    });
  }

  private async saveResourceState(): Promise<void> {
    const resourceSerializedOutput = await this.resourceSerializationService.serialize();
    await this.stateManagementService.saveResourceState(this.resourceStateFileName, resourceSerializedOutput, {
      version: 1,
    });
  }
}
