import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EFSClient } from '@aws-sdk/client-efs';
import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import {
  App,
  Diff,
  DiffMetadata,
  IActionInputs,
  IStateProvider,
  ModelSerializationService,
  Module,
  Resource,
  ResourceSerializationService,
  ResourceSerializedOutput,
  StateManagementService,
  TransactionOptions,
  TransactionService,
} from '@quadnix/octo';
import * as packageJson from '../package.json';
import { IamRoleAnchor } from './anchors/iam-role.anchor.model';
import { IamUserAnchor } from './anchors/iam-user.anchor.model';
import { Action } from './models/action.abstract';
import { AddEnvironmentAction } from './models/environment/actions/add-environment.action';
import { DeleteEnvironmentAction } from './models/environment/actions/delete-environment.action';
import { AddImageAction } from './models/image/actions/add-image.action';
import { DeleteImageAction } from './models/image/actions/delete-image.action';
import { AddRegionAction } from './models/region/actions/add-region.action';
import { DeleteRegionAction } from './models/region/actions/delete-region.action';
import { AwsRegion, AwsRegionId } from './models/region/aws.region.model';
import { AddServerAction } from './models/server/actions/add-server.action';
import { DeleteServerAction } from './models/server/actions/delete-server.action';
import { AwsServer } from './models/server/aws.server.model';
import { AddS3StaticWebsiteAction } from './models/service/s3-static-website/actions/add-s3-static-website.action';
import { DeleteS3StaticWebsiteAction } from './models/service/s3-static-website/actions/delete-s3-static-website.action';
import { UpdateSourcePathsS3StaticWebsiteAction } from './models/service/s3-static-website/actions/update-source-paths-s3-static-website.action';
import { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model';
import { S3StorageService } from './models/service/s3-storage/s3-storage.service.model';
import { AddS3StorageAction as AddS3StorageModelAction } from './models/service/s3-storage/actions/add-s3-storage.action';
import { DeleteS3StorageAction as DeleteS3StorageModelAction } from './models/service/s3-storage/actions/delete-s3-storage.action';
import { UpdateDirectoriesS3StorageAction as UpdateDirectoriesS3StorageModelAction } from './models/service/s3-storage/actions/update-directories-s3-storage.action';
import { NginxRouterModule } from './modules/routers/nginx.router.module';
import { AddEcrImageAction } from './resources/ecr/actions/add-ecr-image.action';
import { DeleteEcrImageAction } from './resources/ecr/actions/delete-ecr-image.action';
import { EcrImage } from './resources/ecr/ecr-image.resource';
import { SharedEcrImage } from './resources/ecr/ecr-image.shared-resource';
import { AddEcsClusterAction } from './resources/ecs/actions/add-ecs-cluster.action';
import { DeleteEcsClusterAction } from './resources/ecs/actions/delete-ecs-cluster.action';
import { EcsCluster } from './resources/ecs/ecs-cluster.resource';
import { SharedEcsCluster } from './resources/ecs/ecs-cluster.shared-resource';
import { AddEfsAction } from './resources/efs/actions/add-efs.action';
import { DeleteEfsAction } from './resources/efs/actions/delete-efs-action';
import { Efs } from './resources/efs/efs.resource';
import { SharedEfs } from './resources/efs/efs.shared-resource';
import { AddIamUserAction } from './resources/iam/actions/add-iam-user.action';
import { DeleteIamUserAction } from './resources/iam/actions/delete-iam-user.action';
import { IamUser } from './resources/iam/iam-user.resource';
import { AddInternetGatewayAction } from './resources/internet-gateway/actions/add-internet-gateway.action';
import { DeleteInternetGatewayAction } from './resources/internet-gateway/actions/delete-internet-gateway.action';
import { InternetGateway } from './resources/internet-gateway/internet-gateway.resource';
import { AddNetworkAclAction } from './resources/network-acl/actions/add-network-acl.action';
import { DeleteNetworkAclAction } from './resources/network-acl/actions/delete-network-acl.action';
import { NetworkAcl } from './resources/network-acl/network-acl.resource';
import { AddRouteTableAction } from './resources/route-table/actions/add-route-table.action';
import { DeleteRouteTableAction } from './resources/route-table/actions/delete-route-table.action';
import { RouteTable } from './resources/route-table/route-table.resource';
import { AddS3StorageAction } from './resources/s3/storage/actions/add-s3-storage.action';
import { DeleteS3StorageAction } from './resources/s3/storage/actions/delete-s3-storage.action';
import { UpdateAddDirectoriesInS3StorageAction } from './resources/s3/storage/actions/update-add-directories-in-s3-storage.action';
import { UpdateRemoveDirectoriesInS3StorageAction } from './resources/s3/storage/actions/update-remove-directories-in-s3-storage.action';
import { S3Storage } from './resources/s3/storage/s3-storage.resource';
import { AddS3WebsiteAction } from './resources/s3/website/actions/add-s3-website.action';
import { DeleteS3WebsiteAction } from './resources/s3/website/actions/delete-s3-website.action';
import { UpdateSourcePathsInS3WebsiteAction } from './resources/s3/website/actions/update-source-paths-in-s3-website.action';
import { S3Website } from './resources/s3/website/s3-website.resource';
import { AddSecurityGroupAction } from './resources/security-groups/actions/add-security-group.action';
import { DeleteSecurityGroupAction } from './resources/security-groups/actions/delete-security-group.action';
import { SecurityGroup } from './resources/security-groups/security-group.resource';
import { AddSubnetAction } from './resources/subnet/actions/add-subnet.action';
import { DeleteSubnetAction } from './resources/subnet/actions/delete-subnet.action';
import { Subnet } from './resources/subnet/subnet.resource';
import { AddVpcAction } from './resources/vpc/actions/add-vpc.action';
import { DeleteVpcAction } from './resources/vpc/actions/delete-vpc.action';
import { Vpc } from './resources/vpc/vpc.resource';

export { AwsRegion, AwsRegionId } from './models/region/aws.region.model';
export { IS3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.interface';
export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model';

export class OctoAws {
  private readonly modelStateFileName: string;
  private readonly resourceStateFileName: string;
  private readonly sharedResourceStateFileName: string;
  private readonly region: AwsRegion;

  private readonly ec2Client: EC2Client;
  private readonly ecrClient: ECRClient;
  private readonly ecsClient: ECSClient;
  private readonly efsClient: EFSClient;
  private readonly iamClient: IAMClient;
  private readonly s3Client: S3Client;
  private readonly stsClient: STSClient;

  private readonly modelSerializationService: ModelSerializationService;
  private readonly resourceSerializationService: ResourceSerializationService;

  private readonly stateManagementService: StateManagementService;

  private readonly transactionService: TransactionService;

  constructor(region: AwsRegion, stateProvider: IStateProvider) {
    this.modelStateFileName = `${region.regionId}-models.json`;
    this.resourceStateFileName = `${region.regionId}-resources.json`;
    this.sharedResourceStateFileName = 'shared-resources.json';
    this.region = region;

    this.ec2Client = new EC2Client({ region: region.nativeAwsRegionId });
    this.ecrClient = new ECRClient({ region: region.nativeAwsRegionId });
    this.ecsClient = new ECSClient({ region: region.nativeAwsRegionId });
    this.efsClient = new EFSClient({ region: region.nativeAwsRegionId });
    this.iamClient = new IAMClient({});
    this.s3Client = new S3Client({ region: region.nativeAwsRegionId });
    this.stsClient = new STSClient({ region: region.nativeAwsRegionId });

    this.modelSerializationService = OctoAws.getModelSerializationService();
    this.resourceSerializationService = OctoAws.getResourceSerializationService();

    this.stateManagementService = StateManagementService.getInstance(stateProvider, true);

    this.transactionService = new TransactionService();
    this.transactionService.registerModelActions([
      // models/environment
      new AddEnvironmentAction(this.region),
      new DeleteEnvironmentAction(this.region),

      // models/image
      new AddImageAction(this.region),
      new DeleteImageAction(this.region),

      // models/region
      new AddRegionAction(),
      new DeleteRegionAction(),

      // models/server
      new AddServerAction(),
      new DeleteServerAction(),

      // models/service/s3-static-website
      new AddS3StaticWebsiteAction(),
      new DeleteS3StaticWebsiteAction(),
      new UpdateSourcePathsS3StaticWebsiteAction(),

      // models/service/s3-storage
      new AddS3StorageModelAction(),
      new DeleteS3StorageModelAction(),
      new UpdateDirectoriesS3StorageModelAction(),
    ]);
    this.transactionService.registerResourceActions([
      // resources/ecr
      new AddEcrImageAction(this.ecrClient, this.region),
      new DeleteEcrImageAction(this.ecrClient, this.region),

      // resources/ecs
      new AddEcsClusterAction(this.ecsClient, this.region),
      new DeleteEcsClusterAction(this.ecsClient, this.region),

      // resources/efs
      new AddEfsAction(this.efsClient, this.region),
      new DeleteEfsAction(this.efsClient, this.region),

      // resources/iam
      new AddIamUserAction(this.iamClient),
      new DeleteIamUserAction(this.iamClient),

      // resources/internet-gateway
      new AddInternetGatewayAction(this.ec2Client),
      new DeleteInternetGatewayAction(this.ec2Client),

      // resources/network-acl
      new AddNetworkAclAction(this.ec2Client),
      new DeleteNetworkAclAction(this.ec2Client),

      // resources/route-table
      new AddRouteTableAction(this.ec2Client),
      new DeleteRouteTableAction(this.ec2Client),

      // resources/s3/storage
      new AddS3StorageAction(this.s3Client),
      new DeleteS3StorageAction(this.s3Client),
      new UpdateAddDirectoriesInS3StorageAction(this.s3Client),
      new UpdateRemoveDirectoriesInS3StorageAction(this.s3Client),

      // resources/s3/website
      new AddS3WebsiteAction(this.s3Client),
      new DeleteS3WebsiteAction(this.s3Client),
      new UpdateSourcePathsInS3WebsiteAction(this.s3Client),

      // resources/security-groups
      new AddSecurityGroupAction(this.ec2Client),
      new DeleteSecurityGroupAction(this.ec2Client),

      // resources/subnet
      new AddSubnetAction(this.ec2Client),
      new DeleteSubnetAction(this.ec2Client),

      // resources/vpc
      new AddVpcAction(this.ec2Client),
      new DeleteVpcAction(this.ec2Client),
    ]);
  }

  private static getModelSerializationService(): ModelSerializationService {
    const modelSerializationService = new ModelSerializationService();

    modelSerializationService.registerClass('IamRoleAnchor', IamRoleAnchor);
    modelSerializationService.registerClass('IamUserAnchor', IamUserAnchor);

    modelSerializationService.registerClass('NginxRouterModule', NginxRouterModule);

    modelSerializationService.registerClass('AwsRegion', AwsRegion);

    modelSerializationService.registerClass('AwsServer', AwsServer);

    modelSerializationService.registerClass('S3StaticWebsiteService', S3StaticWebsiteService);
    modelSerializationService.registerClass('S3StorageService', S3StorageService);

    return modelSerializationService;
  }

  private static getPackageVersion(): string {
    return packageJson.version;
  }

  private static getResourceSerializationService(): ResourceSerializationService {
    const resourceSerializationService = new ResourceSerializationService();

    resourceSerializationService.registerClass('EcrImage', EcrImage);
    resourceSerializationService.registerClass('SharedEcrImage', SharedEcrImage);

    resourceSerializationService.registerClass('EcsCluster', EcsCluster);
    resourceSerializationService.registerClass('SharedEcsCluster', SharedEcsCluster);

    resourceSerializationService.registerClass('Efs', Efs);
    resourceSerializationService.registerClass('SharedEfs', SharedEfs);

    resourceSerializationService.registerClass('IamUser', IamUser);

    resourceSerializationService.registerClass('InternetGateway', InternetGateway);

    resourceSerializationService.registerClass('NetworkAcl', NetworkAcl);

    resourceSerializationService.registerClass('RouteTable', RouteTable);

    resourceSerializationService.registerClass('S3Storage', S3Storage);
    resourceSerializationService.registerClass('S3Website', S3Website);

    resourceSerializationService.registerClass('SecurityGroup', SecurityGroup);

    resourceSerializationService.registerClass('Subnet', Subnet);

    resourceSerializationService.registerClass('Vpc', Vpc);

    return resourceSerializationService;
  }

  async beginTransaction(
    diffs: Diff[],
    options: TransactionOptions,
  ): Promise<AsyncGenerator<DiffMetadata[][] | Resource<unknown>[], DiffMetadata[][]>> {
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
    const serializedOutput: ResourceSerializedOutput = JSON.parse(previousState.toString());
    serializedOutput.sharedResources = JSON.parse(previousSharedState.toString()).sharedResources;
    const oldResources = await this.resourceSerializationService.deserialize(serializedOutput);

    // Declare new resources, starting with an exact copy of old resources.
    const newResources = await this.resourceSerializationService.deserialize(serializedOutput);

    return this.transactionService.beginTransaction(diffs, oldResources, newResources, options);
  }

  async commitTransaction(modelTransaction: DiffMetadata[][], resources: Resource<unknown>[]): Promise<void> {
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

  registerModule(module: Module): void {
    this.modelSerializationService.registerModule(module);
  }
}
