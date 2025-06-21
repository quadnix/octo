import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  type Deployment,
  type Environment,
  Factory,
  type Filesystem,
  type ModuleSchemaInputs,
  type Region,
  type Server,
  type Service,
  type Subnet,
  SubnetType,
  stub,
} from '@quadnix/octo';
import { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/ini-based-aws-account';
import { AppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { AwsDeploymentModule } from '@quadnix/octo-aws-cdk/modules/deployment/ecs-based-aws-deployment';
import { AwsEnvironmentModule } from '@quadnix/octo-aws-cdk/modules/environment/ecs-based-aws-environment';
import { AwsExecutionModule } from '@quadnix/octo-aws-cdk/modules/execution/ecs-based-aws-execution';
import { AwsFilesystemModule } from '@quadnix/octo-aws-cdk/modules/filesystem/efs-based-aws-filesystem';
import { AwsImageModule } from '@quadnix/octo-aws-cdk/modules/image/ecr-based-aws-image';
import { AwsRegionModule } from '@quadnix/octo-aws-cdk/modules/region/per-az-aws-region';
import { RegionId } from '@quadnix/octo-aws-cdk/modules/region/per-az-aws-region/schema';
import { AwsServerModule } from '@quadnix/octo-aws-cdk/modules/server/ecs-based-aws-server';
import { S3StorageAccess } from '@quadnix/octo-aws-cdk/modules/server/ecs-based-aws-server/schema';
import { AwsS3StorageServiceModule } from '@quadnix/octo-aws-cdk/modules/service/s3-storage-aws-service';
import { AwsSubnetModule } from '@quadnix/octo-aws-cdk/modules/subnet/simple-aws-subnet';

type ModuleDefinition<T extends AModule<unknown, any>> = {
  module: Constructable<T>;
  moduleId: string;
  moduleInputs: ModuleSchemaInputs<T>;
};

export class ModuleDefinitions {
  private readonly moduleDefinitions: ModuleDefinition<AModule<unknown, any>>[] = [];

  constructor() {
    this.init();
  }

  add<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    this.moduleDefinitions.push({ module, moduleId, moduleInputs });
  }

  get<T extends AModule<unknown, any>>(moduleId: string): ModuleDefinition<T> | undefined {
    return this.moduleDefinitions.find((m) => m.moduleId === moduleId) as ModuleDefinition<T>;
  }

  getAll(): ModuleDefinitions['moduleDefinitions'] {
    return this.moduleDefinitions;
  }

  private init(): void {
    this.add(AppModule, 'app-module', { name: 'aws-ecs-server' });
    this.add(AwsIniAccountModule, 'account-module', {
      accountId: '099051346528', // Fix me: AWS account ID.
      app: stub<App>('${{app-module.model.app}}'),
    });
    this.add(AwsRegionModule, 'region-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      regionId: RegionId.AWS_US_EAST_1A,
      vpcCidrBlock: '10.0.0.0/16',
    });
    this.add(AwsImageModule, 'image-module', {
      imageFamily: 'quadnix',
      imageName: 'test',
      regions: [stub<Region>('${{region-module.model.region}}')],
    });
    this.add(AwsFilesystemModule, 'region-filesystem-module', {
      filesystemName: 'region-filesystem',
      region: stub<Region>('${{region-module.model.region}}'),
    });
    this.add(AwsEnvironmentModule, 'qa-environment-module', {
      environmentName: 'qa',
      environmentVariables: { NODE_ENV: 'qa', REGION: RegionId.AWS_US_EAST_1A },
      region: stub<Region>('${{region-module.model.region}}'),
    });
    this.add(AwsSubnetModule, 'public-subnet-module', {
      localFilesystems: [stub<Filesystem>('${{region-filesystem-module.model.filesystem}}')],
      region: stub<Region>('${{region-module.model.region}}'),
      subnetAvailabilityZone: 'us-east-1a',
      subnetCidrBlock: '10.0.0.0/24',
      subnetName: 'public-subnet',
      subnetOptions: {
        createNatGateway: true,
        disableSubnetIntraNetwork: false,
        subnetType: SubnetType.PUBLIC,
      },
    });
    this.add(AwsSubnetModule, 'private-subnet-module', {
      region: stub<Region>('${{region-module.model.region}}'),
      subnetAvailabilityZone: 'us-east-1a',
      subnetCidrBlock: '10.0.1.0/24',
      subnetName: 'private-subnet',
      subnetOptions: {
        createNatGateway: false,
        disableSubnetIntraNetwork: true,
        subnetType: SubnetType.PRIVATE,
      },
      subnetSiblings: [
        {
          attachToNatGateway: true,
          subnetCidrBlock: stub<string>('${{public-subnet-module.input.subnetCidrBlock}}'),
          subnetName: 'public-subnet',
        },
      ],
    });
    this.add(AwsS3StorageServiceModule, 's3-storage-module', {
      bucketName: 'ecs-server-storage',
      region: stub<Region>('${{region-module.model.region}}'),
      remoteDirectoryPaths: ['backend'],
    });
    this.add(AwsServerModule, 'backend-server-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      s3: [
        {
          directories: [{ access: S3StorageAccess.READ_WRITE, remoteDirectoryPath: 'backend' }],
          service: stub<Service>('${{s3-storage-module.model.service}}'),
        },
      ],
      serverKey: 'backend',
    });
    this.add(AwsDeploymentModule, 'backend-deployment-v1-module', {
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
    this.add(AwsExecutionModule, 'backend-v1-public-execution-module', {
      deployments: {
        main: {
          containerProperties: {
            image: {
              essential: true,
              name: 'backend-v1',
            },
          },
          deployment: stub<Deployment>('${{backend-deployment-v1-module.model.deployment}}'),
        },
        sidecars: [],
      },
      desiredCount: 1,
      environment: stub<Environment>('${{qa-environment-module.model.environment}}'),
      executionId: 'backend-v1-aws-us-east-1a-qa-public-subnet',
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
    this.add(AwsExecutionModule, 'backend-v1-private-execution-module', {
      deployments: {
        main: {
          containerProperties: {
            image: {
              essential: true,
              name: 'backend-v1',
            },
          },
          deployment: stub<Deployment>('${{backend-deployment-v1-module.model.deployment}}'),
        },
        sidecars: [],
      },
      desiredCount: 1,
      environment: stub<Environment>('${{qa-environment-module.model.environment}}'),
      executionId: 'backend-v1-aws-us-east-1a-qa-private-subnet',
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
  }

  update<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index === -1) {
      this.add(module, moduleId, moduleInputs);
    } else {
      this.moduleDefinitions[index] = {
        module,
        moduleId,
        moduleInputs,
      };
    }
  }

  remove(moduleId: string): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index > -1) {
      this.moduleDefinitions.splice(index, 1);
    }
  }
}

@Factory<ModuleDefinitions>(ModuleDefinitions)
export class ModuleDefinitionsFactory {
  private static instance: ModuleDefinitions;

  static async create(): Promise<ModuleDefinitions> {
    if (!this.instance) {
      this.instance = new ModuleDefinitions();
    }
    return this.instance;
  }
}
