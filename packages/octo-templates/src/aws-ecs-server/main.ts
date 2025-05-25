import {
  type Account,
  type App,
  type Deployment,
  type Environment,
  type Filesystem,
  LocalStateProvider,
  Octo,
  type Region,
  type Server,
  type Service,
  type Subnet,
  SubnetType,
  stub,
} from '@quadnix/octo';
import { AwsAccountModule } from '@quadnix/octo-aws-cdk/account/ini-based-aws-account';
import { AppModule } from '@quadnix/octo-aws-cdk/app/simple-app';
import { AwsDeploymentModule } from '@quadnix/octo-aws-cdk/deployment/ecs-based-aws-deployment';
import { AwsImageModule } from '@quadnix/octo-aws-cdk/image/ecr-based-aws-image';
import { AwsFilesystemModule } from '@quadnix/octo-aws-cdk/filesystem/efs-based-aws-filesystem';
import { AwsEnvironmentModule } from '@quadnix/octo-aws-cdk/environment/ecs-based-aws-environment';
import { AwsExecutionModule } from '@quadnix/octo-aws-cdk/execution/ecs-based-aws-execution';
import { AwsRegionModule } from '@quadnix/octo-aws-cdk/region/per-az-aws-region';
import { RegionId } from '@quadnix/octo-aws-cdk/region/per-az-aws-region/schema';
import { AwsServerModule } from '@quadnix/octo-aws-cdk/server/ecs-based-aws-server';
import { S3StorageAccess } from '@quadnix/octo-aws-cdk/server/ecs-based-aws-server/schema';
import { AwsS3StorageServiceModule } from '@quadnix/octo-aws-cdk/service/s3-storage-aws-service';
import { AwsSubnetModule } from '@quadnix/octo-aws-cdk/subnet/simple-aws-subnet';
import { EventLoggerListener } from '@quadnix/octo-event-listeners';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const octoStatePath = join(__dirname, '.octo');

const octo = new Octo();
const stateProvider = new LocalStateProvider(octoStatePath);

await octo.initialize(stateProvider, [{ type: EventLoggerListener }]);

octo.loadModule(AppModule, 'app-module', { name: 'aws-ecs-server' });
octo.loadModule(AwsAccountModule, 'account-module', {
  accountId: '099051346528', // Fix me: AWS account ID.
  app: stub<App>('${{app-module.model.app}}'),
});
octo.loadModule(AwsRegionModule, 'region-module', {
  account: stub<Account>('${{account-module.model.account}}'),
  regionId: RegionId.AWS_US_EAST_1A,
  vpcCidrBlock: '10.0.0.0/16',
});
octo.loadModule(AwsImageModule, 'image-module', {
  imageFamily: 'quadnix',
  imageName: 'test',
  regions: [stub<Region>('${{region-module.model.region}}')],
});
octo.loadModule(AwsFilesystemModule, 'region-filesystem-module', {
  filesystemName: 'region-filesystem',
  region: stub<Region>('${{region-module.model.region}}'),
});
octo.loadModule(AwsEnvironmentModule, 'qa-environment-module', {
  environmentName: 'qa',
  environmentVariables: { NODE_ENV: 'qa', REGION: RegionId.AWS_US_EAST_1A },
  region: stub<Region>('${{region-module.model.region}}'),
});
octo.loadModule(AwsSubnetModule, 'public-subnet-module', {
  localFilesystems: [stub<Filesystem>('${{region-filesystem-module.model.filesystem}}')],
  region: stub<Region>('${{region-module.model.region}}'),
  subnetAvailabilityZone: 'us-east-1a',
  subnetCidrBlock: '10.0.0.0/24',
  subnetName: 'public-subnet',
  subnetOptions: {
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PUBLIC,
  },
});
octo.loadModule(AwsSubnetModule, 'private-subnet-module', {
  region: stub<Region>('${{region-module.model.region}}'),
  subnetAvailabilityZone: 'us-east-1a',
  subnetCidrBlock: '10.0.1.0/24',
  subnetName: 'private-subnet',
  subnetOptions: {
    disableSubnetIntraNetwork: true,
    subnetType: SubnetType.PRIVATE,
  },
  subnetSiblings: [
    { subnetCidrBlock: stub<string>('${{public-subnet-module.input.subnetCidrBlock}}'), subnetName: 'public-subnet' },
  ],
});
octo.loadModule(AwsS3StorageServiceModule, 's3-storage-module', {
  bucketName: 'ecs-server-storage',
  region: stub<Region>('${{region-module.model.region}}'),
  remoteDirectoryPaths: ['backend'],
});
octo.loadModule(AwsServerModule, 'backend-server-module', {
  account: stub<Account>('${{account-module.model.account}}'),
  s3: [
    {
      directories: [{ access: S3StorageAccess.READ_WRITE, remoteDirectoryPath: 'backend' }],
      service: stub<Service>('${{s3-storage-module.model.service}}'),
    },
  ],
  serverKey: 'backend',
});
octo.loadModule(AwsDeploymentModule, 'backend-deployment-v1-module', {
  deploymentContainerProperties: {
    cpu: 256,
    image: {
      command: 'node webserver',
      ports: [{ containerPort: 3000, protocol: 'tcp' }],
      // eslint-disable-next-line spellcheck/spell-checker
      uri: 'docker.io/ealen/echo-server:0.9.2', // Fix me: Docker image URI.
    },
    memory: 512,
  },
  deploymentTag: 'v1',
  server: stub<Server>('${{backend-server-module.model.server}}'),
});
octo.loadModule(AwsExecutionModule, 'backend-v1-public-execution-module', {
  deployment: stub<Deployment>('${{backend-deployment-v1-module.model.deployment}}'),
  desiredCount: 1,
  environment: stub<Environment>('${{qa-environment-module.model.environment}}'),
  filesystems: [stub<Filesystem>('${{region-filesystem-module.model.filesystem}}')],
  securityGroupRules: [
    {
      CidrBlock: '0.0.0.0/0',
      Egress: false,
      FromPort: 80,
      IpProtocol: 'tcp',
      ToPort: 80,
    },
  ],
  subnet: stub<Subnet>('${{public-subnet-module.model.subnet}}'),
});
octo.loadModule(AwsExecutionModule, 'backend-v1-private-execution-module', {
  deployment: stub<Deployment>('${{backend-deployment-v1-module.model.deployment}}'),
  desiredCount: 1,
  environment: stub<Environment>('${{qa-environment-module.model.environment}}'),
  securityGroupRules: [
    {
      CidrBlock: '0.0.0.0/0',
      Egress: false,
      FromPort: 80,
      IpProtocol: 'tcp',
      ToPort: 80,
    },
  ],
  subnet: stub<Subnet>('${{private-subnet-module.model.subnet}}'),
});

octo.orderModules([
  AppModule,
  AwsAccountModule,
  AwsRegionModule,
  AwsImageModule,
  AwsFilesystemModule,
  AwsEnvironmentModule,
  AwsSubnetModule,
  AwsS3StorageServiceModule,
  AwsServerModule,
  AwsDeploymentModule,
  AwsExecutionModule,
]);

const { 'app-module.model.app': app } = (await octo.compose()) as { 'app-module.model.app': App };
const transaction = octo.beginTransaction(app);
await transaction.next();
