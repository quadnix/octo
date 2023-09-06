import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import {
  App,
  Diff,
  DiffMetadata,
  IActionInputs,
  IStateProvider,
  ModelSerializationService,
  Resource,
  ResourceSerializationService,
  StateManagementService,
  TransactionOptions,
  TransactionService,
} from '@quadnix/octo';
import * as packageJson from '../package.json';
import { Action } from './models/action.abstract';
import { AddImageAction } from './models/image/actions/add-image.action';
import { AddRegionAction } from './models/region/actions/add-region.action';
import { AwsRegion, AwsRegionId } from './models/region/aws.region.model';
import { AddS3StaticWebsiteAction } from './models/service/s3-static-website/actions/add-s3-static-website.action';
import { DeleteS3StaticWebsiteAction } from './models/service/s3-static-website/actions/delete-s3-static-website.action';
import { UpdateSourcePathsS3StaticWebsiteAction } from './models/service/s3-static-website/actions/update-source-paths-s3-static-website.action';
import { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model';
import { AddEcrImageAction } from './resources/ecr/actions/add-ecr-image.action';
import { DeleteEcrImageAction } from './resources/ecr/actions/delete-ecr-image.action';
import { EcrImage } from './resources/ecr/ecr-image.resource';
import { AddInternetGatewayAction } from './resources/internet-gateway/actions/add-internet-gateway.action';
import { InternetGateway } from './resources/internet-gateway/internet-gateway.resource';
import { AddNetworkAclAction } from './resources/network-acl/actions/add-network-acl.action';
import { NetworkAcl } from './resources/network-acl/network-acl.resource';
import { AddRouteTableAction } from './resources/route-table/actions/add-route-table.action';
import { RouteTable } from './resources/route-table/route-table.resource';
import { AddS3WebsiteAction } from './resources/s3/website/actions/add-s3-website.action';
import { DeleteS3WebsiteAction } from './resources/s3/website/actions/delete-s3-website.action';
import { UpdateSourcePathsInS3WebsiteAction } from './resources/s3/website/actions/update-source-paths-in-s3-website.action';
import { S3Website } from './resources/s3/website/s3-website.resource';
import { AddSecurityGroupAction } from './resources/security-groups/actions/add-security-group.action';
import { SecurityGroup } from './resources/security-groups/security-group.resource';
import { AddSubnetAction } from './resources/subnet/actions/add-subnet.action';
import { Subnet } from './resources/subnet/subnet.resource';
import { AddVpcAction } from './resources/vpc/actions/add-vpc.action';
import { Vpc } from './resources/vpc/vpc.resource';

export { AwsRegion, AwsRegionId } from './models/region/aws.region.model';
export { IS3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.interface';
export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model';

export class OctoAws {
  private readonly modelStateFileName: string;
  private readonly resourceStateFileName: string;
  private readonly region: AwsRegion;

  private readonly ec2Client: EC2Client;
  private readonly ecrClient: ECRClient;
  private readonly s3Client: S3Client;
  private readonly stsClient: STSClient;

  private readonly modelSerializationService: ModelSerializationService;
  private readonly resourceSerializationService: ResourceSerializationService;

  private readonly stateManagementService: StateManagementService;

  private readonly transactionService: TransactionService;

  constructor(region: AwsRegion, stateProvider: IStateProvider) {
    this.modelStateFileName = `${region.regionId}-models.json`;
    this.resourceStateFileName = `${region.regionId}-resources.json`;
    this.region = region;

    this.ec2Client = new EC2Client({ region: region.nativeAwsRegionId });
    this.ecrClient = new ECRClient({ region: region.nativeAwsRegionId });
    this.s3Client = new S3Client({ region: region.nativeAwsRegionId });
    this.stsClient = new STSClient({ region: region.nativeAwsRegionId });

    this.modelSerializationService = OctoAws.getModelSerializationService();
    this.resourceSerializationService = OctoAws.getResourceSerializationService();

    this.stateManagementService = StateManagementService.getInstance(stateProvider, true);

    this.transactionService = new TransactionService();
    this.transactionService.registerModelActions([
      // models/image
      new AddImageAction(),

      // models/region
      new AddRegionAction(),

      // models/service/s3-static-website
      new AddS3StaticWebsiteAction(),
      new DeleteS3StaticWebsiteAction(),
      new UpdateSourcePathsS3StaticWebsiteAction(),
    ]);
    this.transactionService.registerResourceActions([
      // resources/ecr
      new AddEcrImageAction(this.ecrClient),
      new DeleteEcrImageAction(this.ecrClient),

      // resources/internet-gateway
      new AddInternetGatewayAction(this.ec2Client),

      // resources/network-acl
      new AddNetworkAclAction(this.ec2Client),

      // resources/route-table
      new AddRouteTableAction(this.ec2Client),

      // resources/s3/website
      new AddS3WebsiteAction(this.s3Client),
      new DeleteS3WebsiteAction(this.s3Client),
      new UpdateSourcePathsInS3WebsiteAction(this.s3Client),

      // resources/security-groups
      new AddSecurityGroupAction(this.ec2Client),

      // resources/subnet
      new AddSubnetAction(this.ec2Client),

      // resources/vpc
      new AddVpcAction(this.ec2Client),
    ]);
  }

  private static getModelSerializationService(): ModelSerializationService {
    const modelSerializationService = new ModelSerializationService();
    modelSerializationService.registerClass('AwsRegion', AwsRegion);
    modelSerializationService.registerClass('S3StaticWebsiteService', S3StaticWebsiteService);
    return modelSerializationService;
  }

  private static getPackageVersion(): string {
    return packageJson.version;
  }

  private static getResourceSerializationService(): ResourceSerializationService {
    const resourceSerializationService = new ResourceSerializationService();
    resourceSerializationService.registerClass('EcrImage', EcrImage);
    resourceSerializationService.registerClass('InternetGateway', InternetGateway);
    resourceSerializationService.registerClass('NetworkAcl', NetworkAcl);
    resourceSerializationService.registerClass('RouteTable', RouteTable);
    resourceSerializationService.registerClass('S3Website', S3Website);
    resourceSerializationService.registerClass('SecurityGroup', SecurityGroup);
    resourceSerializationService.registerClass('Subnet', Subnet);
    resourceSerializationService.registerClass('Vpc', Vpc);
    return resourceSerializationService;
  }

  async beginTransaction(
    diffs: Diff[],
    options: TransactionOptions,
  ): Promise<AsyncGenerator<DiffMetadata[][], DiffMetadata[][]>> {
    // Get previous resources from saved state.
    const previousState = await this.stateManagementService.getState(
      this.resourceStateFileName,
      JSON.stringify({
        dependencies: [],
        resources: {},
      }),
    );
    const serializedOutput = JSON.parse(previousState.toString());
    const oldResources = await this.resourceSerializationService.deserialize(serializedOutput);

    // Declare new resources, starting with an exact copy of old resources.
    const newResources = await this.resourceSerializationService.deserialize(serializedOutput);

    return this.transactionService.beginTransaction(diffs, oldResources, newResources, options);
  }

  async commitTransaction(modelTransaction: DiffMetadata[][], resourceTransaction: DiffMetadata[][]): Promise<void> {
    // Run post-transactions on actions.
    for (const diffsProcessedInSameLevel of modelTransaction) {
      const postTransactionPromises: Promise<void>[] = [];
      diffsProcessedInSameLevel.forEach((d) => {
        (d.actions as Action[]).forEach((a) => {
          postTransactionPromises.push(a.postTransaction(d.diff));
        });
      });
      await Promise.all(postTransactionPromises);
    }

    // Generate new app with this region as boundary.
    const newRegionWithBoundary = await this.modelSerializationService.deserialize(
      this.modelSerializationService.serialize(this.region),
    );
    const newAppWithBoundary = newRegionWithBoundary.getParents('app')['app'][0].to as App;

    // Save the state of the new app.
    const serializedOutput = this.modelSerializationService.serialize(newAppWithBoundary);
    serializedOutput['version'] = OctoAws.getPackageVersion();
    await this.stateManagementService.saveState(this.modelStateFileName, Buffer.from(JSON.stringify(serializedOutput)));

    // Save the state of resources.
    const resources = resourceTransaction.flat().map((t) => t.model as Resource<unknown>);
    const resourceSerializedOutput = this.resourceSerializationService.serialize(resources);
    resourceSerializedOutput['version'] = OctoAws.getPackageVersion();
    await this.stateManagementService.saveState(
      this.resourceStateFileName,
      Buffer.from(JSON.stringify(resourceSerializedOutput)),
    );
  }

  async diff(): Promise<Diff[]> {
    // Get previous app from saved state. It was saved with this region as boundary.
    const previousState = await this.stateManagementService.getState(
      this.modelStateFileName,
      JSON.stringify({
        dependencies: [],
        models: {},
      }),
    );
    const serializedOutput = JSON.parse(previousState.toString());

    // Get previousApp. If version mismatch, previousApp is void.
    const previousAppWithBoundary =
      serializedOutput.version === OctoAws.getPackageVersion()
        ? ((await this.modelSerializationService.deserialize(serializedOutput)) as App)
        : undefined;

    // Generate new app with this region as boundary.
    const newRegionWithBoundary = await this.modelSerializationService.deserialize(
      this.modelSerializationService.serialize(this.region),
    );
    const newAppWithBoundary = newRegionWithBoundary.getParents('app')['app'][0].to as App;

    // Diff newApp with previousApp.
    return newAppWithBoundary.diff(previousAppWithBoundary);
  }

  static async getPreviousAppWithBoundary(
    regionId: AwsRegionId,
    stateProvider: IStateProvider,
  ): Promise<App | undefined> {
    const modelSerializationService = OctoAws.getModelSerializationService();
    const modelStateFileName = `${regionId}-models.json`;
    const stateManagementService = StateManagementService.getInstance(stateProvider, true);

    // Get previous app from saved state. It was saved with this region as boundary.
    const previousState = await stateManagementService.getState(
      modelStateFileName,
      JSON.stringify({
        dependencies: [],
        models: {},
      }),
    );
    const serializedOutput = JSON.parse(previousState.toString());

    // Get previousApp. If version mismatch, previousApp is void.
    return serializedOutput.version === OctoAws.getPackageVersion()
      ? ((await modelSerializationService.deserialize(serializedOutput)) as App)
      : undefined;
  }

  registerInputs(inputs: IActionInputs): void {
    this.transactionService.registerInputs(inputs);
  }
}
