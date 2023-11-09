import {
  ActionInputs,
  App,
  Container,
  Diff,
  DiffMetadata,
  IStateProvider,
  ModelSerializationService,
  ResourceSerializationService,
  ResourceSerializedOutput,
  StateManagementService,
  TransactionOptions,
  TransactionService,
  UnknownResource,
} from '@quadnix/octo';
import { AAction } from './models/action.abstract.js';

export { EcrImage } from './models/image/ecr.image.model.js';
export { AwsRegion, AwsRegionId } from './models/region/aws.region.model.js';
export { AwsServer } from './models/server/aws.server.model.js';
export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model.js';
export { S3StorageService } from './models/service/s3-storage/s3-storage.service.model.js';

export class OctoAws {
  private readonly modelStateFileName: string = 'models.json';
  private readonly resourceStateFileName: string = 'resources.json';
  private readonly sharedResourceStateFileName: string = 'shared-resources.json';

  private previousApp: App | undefined;

  private modelSerializationService: ModelSerializationService;
  private resourceSerializationService: ResourceSerializationService;
  private stateManagementService: StateManagementService;
  private transactionService: TransactionService;

  private static getPackageVersion(): string {
    return '0.0.1';
  }

  async beginTransaction(
    diffs: Diff[],
    options: TransactionOptions,
  ): Promise<AsyncGenerator<DiffMetadata[][] | UnknownResource[], DiffMetadata[][]>> {
    // Get previous resources from saved state.
    const previousState = await this.stateManagementService.getState(
      this.resourceStateFileName,
      JSON.stringify({
        dependencies: [],
        resources: {},
      }),
    );
    // Get previous shared-resources from saved state.
    const previousSharedState = await this.stateManagementService.getState(
      this.sharedResourceStateFileName,
      JSON.stringify({
        sharedResources: {},
      }),
    );

    // Get old resources.
    const serializedOutput: ResourceSerializedOutput = JSON.parse(previousState.toString());
    serializedOutput.sharedResources = JSON.parse(previousSharedState.toString()).sharedResources;
    const oldResources = await this.resourceSerializationService.deserialize(serializedOutput);
    // Declare new resources, starting with an exact copy of old resources.
    const newResources = await this.resourceSerializationService.deserialize(serializedOutput);

    return this.transactionService.beginTransaction(diffs, oldResources, newResources, options);
  }

  async commitTransaction(app: App, modelTransaction: DiffMetadata[][], resources: UnknownResource[]): Promise<void> {
    // Run post-transactions on actions.
    for (const diffsProcessedInSameLevel of modelTransaction) {
      const postTransactionPromises: Promise<void>[] = [];
      diffsProcessedInSameLevel.forEach((d) => {
        (d.actions as AAction[]).forEach((a) => {
          postTransactionPromises.push(a.postTransaction(d.diff));
        });
      });
      await Promise.all(postTransactionPromises);
    }

    // Save the state of the new app.
    const serializedOutput = this.modelSerializationService.serialize(app);
    serializedOutput['version'] = OctoAws.getPackageVersion();
    await this.stateManagementService.saveState(this.modelStateFileName, Buffer.from(JSON.stringify(serializedOutput)));

    // Serialize resources.
    const resourceSerializedOutput = this.resourceSerializationService.serialize(resources);
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

    // Save local copy of App.
    this.previousApp = (await this.modelSerializationService.deserialize(
      this.modelSerializationService.serialize(app),
    )) as App;
  }

  async diff(app: App): Promise<Diff[]> {
    return app.diff(this.previousApp);
  }

  async initialize(stateProvider: IStateProvider): Promise<App | undefined> {
    this.modelSerializationService = await Container.get(ModelSerializationService);
    this.resourceSerializationService = await Container.get(ResourceSerializationService);
    this.stateManagementService = await Container.get(StateManagementService, { args: [stateProvider] });
    this.transactionService = await Container.get(TransactionService);

    // Get previous app from saved state.
    const previousState = await this.stateManagementService.getState(
      this.modelStateFileName,
      JSON.stringify({
        dependencies: [],
        models: {},
      }),
    );
    const serializedOutput = JSON.parse(previousState.toString());

    // Save local copy of App. If version mismatch, previousApp is void.
    this.previousApp =
      serializedOutput.version === OctoAws.getPackageVersion()
        ? ((await this.modelSerializationService.deserialize(serializedOutput)) as App)
        : undefined;

    // Return a new copy of App for modifications.
    return this.previousApp ? ((await this.modelSerializationService.deserialize(serializedOutput)) as App) : undefined;
  }

  registerInputs(inputs: ActionInputs): void {
    this.transactionService.registerInputs(inputs);
  }
}
