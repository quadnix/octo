import {
  type ActionInputs,
  App,
  Container,
  Diff,
  DiffMetadata,
  EnableHook,
  type IStateProvider,
  InputService,
  ModelSerializationService,
  ResourceSerializationService,
  StateManagementService,
  type TransactionOptions,
  TransactionService,
  type UnknownResource,
} from '@quadnix/octo';

export class OctoAws {
  private readonly modelStateFileName: string = 'models.json';
  private readonly resourceStateFileName: string = 'resources.json';

  private previousApp: App | undefined;

  private inputService: InputService;
  private modelSerializationService: ModelSerializationService;
  private resourceSerializationService: ResourceSerializationService;
  private stateManagementService: StateManagementService;
  private transactionService: TransactionService;

  private static getPackageVersion(): string {
    return '0.0.1';
  }

  private async retrieveModelState(): Promise<App | undefined> {
    const { data: modelSerializedOutput, userData } = await this.stateManagementService.getModelState(
      this.modelStateFileName,
    );

    // Initialize previous model state.
    return userData['version'] === OctoAws.getPackageVersion()
      ? ((await this.modelSerializationService.deserialize(modelSerializedOutput)) as App)
      : undefined;
  }

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    await this.stateManagementService.saveModelState(this.modelStateFileName, modelSerializedOutput, {
      version: OctoAws.getPackageVersion(),
    });
  }

  private async retrieveResourceState(): Promise<void> {
    const { data: resourceSerializedOutput } = await this.stateManagementService.getResourceState(
      this.resourceStateFileName,
    );

    // Initialize previous resource state.
    await this.resourceSerializationService.deserialize(resourceSerializedOutput);
  }

  private async saveResourceState(): Promise<void> {
    const resourceSerializedOutput = await this.resourceSerializationService.serialize();
    await this.stateManagementService.saveResourceState(this.resourceStateFileName, resourceSerializedOutput, {
      version: OctoAws.getPackageVersion(),
    });
  }

  async initialize(stateProvider: IStateProvider): Promise<App | undefined> {
    [
      this.inputService,
      this.modelSerializationService,
      this.resourceSerializationService,
      this.stateManagementService,
      this.transactionService,
    ] = await Promise.all([
      Container.get(InputService),
      Container.get(ModelSerializationService),
      Container.get(ResourceSerializationService),
      Container.get(StateManagementService, { args: [stateProvider] }),
      Container.get(TransactionService),
    ]);

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
    this.previousApp = await this.retrieveModelState();

    // Return a new copy of App for modifications.
    return this.previousApp ? await this.retrieveModelState() : undefined;
  }

  registerInputs(inputs: ActionInputs): void {
    this.inputService.registerInputs(inputs);
  }

  async diff(app: App): Promise<Diff[]> {
    return app.diff(this.previousApp);
  }

  async beginTransaction(
    diffs: Diff[],
    options?: TransactionOptions,
  ): Promise<AsyncGenerator<DiffMetadata[][] | UnknownResource[], DiffMetadata[][]>> {
    return this.transactionService.beginTransaction(diffs, options || {});
  }

  @EnableHook('PreCommitHook')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async commitTransaction(app: App, modelTransaction: DiffMetadata[][]): Promise<void> {
    // `modelTransaction` is being used indirectly by the @EnableHook.
    // Do not remove this argument.

    // Save the state of the new app and its resources.
    await this.saveModelState(app);
    await this.saveResourceState();

    // Reset the runtime environment with the latest state.
    await this.retrieveResourceState();
    this.previousApp = await this.retrieveModelState();
  }
}
