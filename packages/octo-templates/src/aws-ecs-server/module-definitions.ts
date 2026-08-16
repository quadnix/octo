import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  type Deployment,
  type Environment,
  Execution,
  Factory,
  type ModuleSchemaInputs,
  type Region,
  type Server,
  type Subnet,
  SubnetType,
  stub,
} from '@quadnix/octo';
import { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { AwsEcsDeploymentModule } from '@quadnix/octo-aws-cdk/modules/deployment/aws-ecs-deployment';
import { AwsEcsEnvironmentModule } from '@quadnix/octo-aws-cdk/modules/environment/aws-ecs-environment';
import { AwsEcsExecutionModule } from '@quadnix/octo-aws-cdk/modules/execution/aws-ecs-execution';
import { AwsMultiAzRegionModule } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region';
import { AwsMultiAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region/schema';
import { AwsEcsServerModule } from '@quadnix/octo-aws-cdk/modules/server/aws-ecs-server';
import { AwsEcsAlbServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-ecs-alb-service';
import { AwsSimpleSubnetModule } from '@quadnix/octo-aws-cdk/modules/subnet/aws-simple-subnet';
import { config } from './app.config.js';

type ModuleDefinition<T extends AModule<unknown, any>> = {
  module: Constructable<T>;
  moduleId: string;
  moduleInputs: ModuleSchemaInputs<T>;
};

/**
 * The modules this template loads, and the inputs it loads them with.
 *
 * A test mutates the set - `update()` to change an input, `remove()` to drop a module - and runs the
 * lifecycle again, which is how the template exercises a change to live infrastructure.
 */
export class ModuleDefinitions {
  private readonly moduleDefinitions: ModuleDefinition<AModule<unknown, any>>[] = [];

  /**
   * Starts from the template's own set of modules.
   */
  constructor() {
    this.init();
  }

  /**
   * Appends a module definition to the end of the set.
   */
  add<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    this.moduleDefinitions.push({ module, moduleId, moduleInputs });
  }

  /**
   * Returns the definition of the given module id, or `undefined` when the set holds none.
   */
  get<T extends AModule<unknown, any>>(moduleId: string): ModuleDefinition<T> | undefined {
    return this.moduleDefinitions.find((m) => m.moduleId === moduleId) as ModuleDefinition<T>;
  }

  /**
   * Returns every definition, in the order the template loads them.
   */
  getAll(): ModuleDefinitions['moduleDefinitions'] {
    return this.moduleDefinitions;
  }

  /**
   * Drops the definition of the given module id. An id the set does not hold is not an error.
   */
  remove(moduleId: string): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index > -1) {
      this.moduleDefinitions.splice(index, 1);
    }
  }

  /**
   * Replaces the definition of the given module id in place, keeping its load order, and appends it
   * when the set holds none.
   */
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

  /**
   * Declares this template's infrastructure: an app, the AWS account hosting it, a two-AZ region with
   * two public and one private subnet, and an echo server running on ECS in the `qa` environment,
   * reachable through an application load balancer on port 80.
   */
  private init(): void {
    this.add(SimpleAppModule, 'app-module', { name: 'aws-ecs-server' });

    this.add(AwsIniAccountModule, 'account-module', {
      accountId: config.AWS_ACCOUNT_ID,
      app: stub<App>('${{app-module.model.app}}'),
      iniProfile: 'default',
    });

    this.add(AwsMultiAzRegionModule, 'region-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      name: 'app-region-east',
      regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
      vpcCidrBlock: '10.0.0.0/16',
    });

    this.add(AwsEcsServerModule, 'backend-server-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      serverKey: 'backend',
    });

    this.add(AwsEcsDeploymentModule, 'backend-deployment-v1-module', {
      deploymentContainerProperties: {
        cpu: 256,
        image: {
          command: 'node webserver',
          ports: [{ containerPort: 80, protocol: 'tcp' }],
          uri: 'docker.io/ealen/echo-server:0.9.2',
        },
        memory: 512,
      },
      deploymentTag: 'v1',
      server: stub<Server>('${{backend-server-module.model.server}}'),
    });

    this.add(AwsEcsEnvironmentModule, 'qa-environment-module', {
      environmentName: 'qa',
      environmentVariables: { NODE_ENV: 'qa' },
      region: stub<Region>('${{region-module.model.region}}'),
    });

    this.add(AwsSimpleSubnetModule, 'public-subnet-module', {
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
    this.add(AwsSimpleSubnetModule, 'public-backup-subnet-module', {
      region: stub<Region>('${{region-module.model.region}}'),
      subnetAvailabilityZone: 'us-east-1b',
      subnetCidrBlock: '10.0.1.0/24',
      subnetName: 'public-backup-subnet',
      subnetOptions: {
        createNatGateway: false,
        disableSubnetIntraNetwork: false,
        subnetType: SubnetType.PUBLIC,
      },
    });
    this.add(AwsSimpleSubnetModule, 'private-subnet-module', {
      region: stub<Region>('${{region-module.model.region}}'),
      subnetAvailabilityZone: 'us-east-1a',
      subnetCidrBlock: '10.0.2.0/24',
      subnetName: 'private-subnet',
      subnetOptions: {
        createNatGateway: false,
        disableSubnetIntraNetwork: true,
        subnetType: SubnetType.PRIVATE,
      },
      subnetSiblings: [
        {
          attachToNatGateway: true,
          subnet: stub<Subnet>('${{public-subnet-module.model.subnet}}'),
        },
        {
          attachToNatGateway: false,
          subnet: stub<Subnet>('${{public-backup-subnet-module.model.subnet}}'),
        },
      ],
    });

    this.add(AwsEcsExecutionModule, 'backend-v1-qa-execution-module', {
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
      executionId: 'backend-v1-qa-execution',
      securityGroupRules: [
        {
          CidrBlock: '0.0.0.0/0',
          Egress: false,
          FromPort: 80,
          IpProtocol: 'tcp',
          ToPort: 80,
        },
        {
          CidrBlock: '0.0.0.0/0',
          Egress: true,
          FromPort: 0,
          IpProtocol: 'tcp',
          ToPort: 65535,
        },
        {
          CidrBlock: '0.0.0.0/0',
          Egress: true,
          FromPort: 0,
          IpProtocol: 'udp',
          ToPort: 65535,
        },
      ],
      subnet: stub<Subnet>('${{private-subnet-module.model.subnet}}'),
    });

    this.add(AwsEcsAlbServiceModule, 'qa-api-alb-module', {
      albName: 'qa-api-alb',
      listeners: [
        {
          DefaultActions: [
            { action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] }, actionType: 'forward' },
          ],
          Port: 80,
          rules: [],
        },
      ],
      region: stub<Region>('${{region-module.model.region}}'),
      subnets: [
        stub<Subnet>('${{public-subnet-module.model.subnet}}'),
        stub<Subnet>('${{public-backup-subnet-module.model.subnet}}'),
      ],
      targets: [
        {
          containerName: 'backend-v1',
          containerPort: 80,
          execution: stub<Execution>('${{backend-v1-qa-execution-module.model.execution}}'),
          healthCheck: {
            HealthCheckIntervalSeconds: 30,
            HealthCheckPath: '/',
            HealthCheckPort: 80,
            HealthCheckProtocol: 'HTTP',
            HealthCheckTimeoutSeconds: 5,
            HealthyThresholdCount: 2,
            Matcher: { HttpCode: 200 },
            UnhealthyThresholdCount: 2,
          },
          Name: 'backend-v1-80',
        },
      ],
    });
  }
}

/**
 * Serves {@link ModuleDefinitions} through the container, so a test and the lifecycle it runs read
 * and mutate one set.
 */
@Factory<ModuleDefinitions>(ModuleDefinitions)
export class ModuleDefinitionsFactory {
  private static instance: ModuleDefinitions;

  /**
   * Returns the shared set, building it on the first call.
   */
  static async create(): Promise<ModuleDefinitions> {
    if (!this.instance) {
      this.instance = new ModuleDefinitions();
    }
    return this.instance;
  }
}
