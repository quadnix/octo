import {
  ActionInputs,
  App,
  Container,
  Diff,
  DiffMetadata,
  EnableHook,
  InputService,
  IStateProvider,
  ModelSerializationService,
  ResourceSerializationService,
  ResourceSerializedOutput,
  StateManagementService,
  TransactionOptions,
  TransactionService,
  UnknownResource,
} from '@quadnix/octo';

export class OctoAws {
  private readonly modelStateFileName: string = 'models.json';
  private readonly resourceStateFileName: string = 'resources.json';
  private readonly sharedResourceStateFileName: string = 'shared-resources.json';

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
    const previousModelState = await this.stateManagementService.getState(
      this.modelStateFileName,
      JSON.stringify({
        dependencies: [],
        models: {},
      }),
    );

    // Initialize previous model state.
    const modelSerializedOutput = JSON.parse(previousModelState.toString());
    return modelSerializedOutput.version === OctoAws.getPackageVersion()
      ? ((await this.modelSerializationService.deserialize(modelSerializedOutput)) as App)
      : undefined;
  }

  private async saveModelState(app: App): Promise<void> {
    const modelSerializedOutput = await this.modelSerializationService.serialize(app);
    modelSerializedOutput['version'] = OctoAws.getPackageVersion();
    await this.stateManagementService.saveState(
      this.modelStateFileName,
      Buffer.from(JSON.stringify(modelSerializedOutput)),
    );
  }

  private async retrieveResourceState(): Promise<void> {
    const previousResourceState = await this.stateManagementService.getState(
      this.resourceStateFileName,
      JSON.stringify({
        dependencies: [],
        resources: {},
      }),
    );

    const previousSharedResourceState = await this.stateManagementService.getState(
      this.sharedResourceStateFileName,
      JSON.stringify({
        sharedResources: {},
      }),
    );

    // Initialize previous resource state.
    const resourceSerializedOutput: ResourceSerializedOutput = JSON.parse(previousResourceState.toString());
    resourceSerializedOutput.sharedResources = JSON.parse(previousSharedResourceState.toString()).sharedResources;
    await this.resourceSerializationService.deserialize(resourceSerializedOutput);
  }

  private async saveResourceState(): Promise<void> {
    const resourceSerializedOutput = await this.resourceSerializationService.serialize();

    // Save the state of shared-resources.
    await this.stateManagementService.saveState(
      this.sharedResourceStateFileName,
      Buffer.from(
        JSON.stringify({
          sharedResources: { ...resourceSerializedOutput.sharedResources },
          version: OctoAws.getPackageVersion(),
        }),
      ),
    );

    // Save the state of resources.
    await this.stateManagementService.saveState(
      this.resourceStateFileName,
      Buffer.from(
        JSON.stringify({
          dependencies: [...resourceSerializedOutput.dependencies],
          resources: { ...resourceSerializedOutput.resources },
          version: OctoAws.getPackageVersion(),
        }),
      ),
    );
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
