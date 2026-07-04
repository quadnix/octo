import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AResource,
  type Account,
  type App,
  MatchingResource,
  type Region,
  SubnetType,
  TerraformUtility,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEcsServiceAnchorSchema } from '../../../../src/anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcsAlbServiceModule } from '../../../../src/modules/service/aws-ecs-alb-service/index.js';
import { EcsClusterSchema } from '../../../../src/resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../../src/resources/ecs-service/index.js';
import { EcsTaskDefinitionSchema } from '../../../../src/resources/ecs-task-definition/index.schema.js';
import { InternetGatewaySchema } from '../../../../src/resources/internet-gateway/index.schema.js';
import { SubnetSchema } from '../../../../src/resources/subnet/index.schema.js';
import { VpcSchema } from '../../../../src/resources/vpc/index.schema.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

const HEALTH_CHECK_RESPONSE = {
  HealthCheckIntervalSeconds: 30,
  HealthCheckPath: '/health',
  HealthCheckPort: 80,
  HealthCheckProtocol: 'HTTP' as const,
  HealthCheckTimeoutSeconds: 5,
  HealthyThresholdCount: 3,
  Matcher: { HttpCode: 200 },
  UnhealthyThresholdCount: 3,
};

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    deployment: [deployment],
    environment: [environment],
    region: [region],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    region: ['region'],
    server: ['backend'],
  });

  const {
    subnet: [subnet1],
  } = await testModuleContainer.createTestModels('testSubnet1Module', {
    account: [account],
    app: [app],
    region: [region],
    subnet: ['public-subnet-1'],
  });
  subnet1.subnetType = SubnetType.PUBLIC;
  const {
    subnet: [subnet2],
  } = await testModuleContainer.createTestModels('testSubnet2Module', {
    account: [account],
    app: [app],
    region: [region],
    subnet: ['public-subnet-2'],
  });
  subnet2.subnetType = SubnetType.PUBLIC;

  const {
    execution: [execution],
  } = await testModuleContainer.createTestModels('testExecutionModule', {
    account: [account],
    app: [app],
    deployment: [deployment],
    environment: [environment],
    execution: [':0:0:0'],
    region: [region],
    server: [server],
    subnet: [subnet1],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: AWS_REGION_ID,
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  const testOverlays = await testModuleContainer.createTestOverlays('testExecutionModule', [
    {
      anchors: [],
      context: `@octo/aws-ecs-execution-overlay=aws-ecs-execution-overlay-${execution.executionId}`,
      properties: {
        executionId: execution.executionId,
      },
    },
  ]);
  const executionOverlay =
    testOverlays[`@octo/aws-ecs-execution-overlay=aws-ecs-execution-overlay-${execution.executionId}`];
  execution.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsServiceAnchorSchema>(
      'AwsEcsServiceAnchorSchema',
      {
        executionId: execution.executionId,
      },
      executionOverlay,
    ),
  );

  const { '@octo/ecs-cluster=ecs-cluster-region-qa': ecsClusterResource } =
    await testModuleContainer.createTestResources<[EcsClusterSchema, InternetGatewaySchema, VpcSchema]>(
      'testModule',
      [
        {
          properties: {
            awsAccountId: AWS_ACCOUNT_ID,
            awsRegionId: AWS_REGION_ID,
            clusterName: 'region-qa',
          },
          resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
          response: {
            clusterArn: 'clusterArn',
          },
          schema: EcsClusterSchema,
          terraform: true,
        },
        {
          properties: {
            awsAccountId: AWS_ACCOUNT_ID,
            awsRegionId: AWS_REGION_ID,
            internetGatewayName: 'default',
          },
          resourceContext: '@octo/internet-gateway=igw-region',
          response: { InternetGatewayId: 'InternetGatewayId' },
          schema: InternetGatewaySchema,
          terraform: true,
        },
        {
          properties: {
            awsAccountId: AWS_ACCOUNT_ID,
            awsAvailabilityZones: ['us-east-1a'],
            awsRegionId: AWS_REGION_ID,
            CidrBlock: '10.0.0.0/16',
            InstanceTenancy: 'default',
          },
          resourceContext: '@octo/vpc=vpc-region',
          response: { VpcId: 'VpcId' },
          schema: VpcSchema,
          terraform: true,
        },
      ],
      { save: true },
    );
  const { '@octo/subnet=subnet-region-public-subnet-1': subnet1Resource } =
    await testModuleContainer.createTestResources<[SubnetSchema]>(
      'testSubnet1Module',
      [
        {
          properties: {
            AvailabilityZone: 'us-east-1a',
            awsAccountId: AWS_ACCOUNT_ID,
            awsRegionId: AWS_REGION_ID,
            CidrBlock: '10.0.0.0/24',
            subnetName: 'public-subnet-1',
          },
          resourceContext: '@octo/subnet=subnet-region-public-subnet-1',
          response: { SubnetArn: 'SubnetArn', SubnetId: 'SubnetId' },
          schema: SubnetSchema,
          terraform: true,
        },
      ],
      { save: true },
    );
  await testModuleContainer.createTestResources<[SubnetSchema]>(
    'testSubnet2Module',
    [
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegionId: AWS_REGION_ID,
          CidrBlock: '10.1.0.0/24',
          subnetName: 'public-subnet-2',
        },
        resourceContext: '@octo/subnet=subnet-region-public-subnet-2',
        response: { SubnetArn: 'SubnetArn', SubnetId: 'SubnetId' },
        schema: SubnetSchema,
        terraform: true,
      },
    ],
    { save: true },
  );
  const {
    '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1': ecsTaskDefinitionResource,
  } = await testModuleContainer.createTestResources<[EcsTaskDefinitionSchema]>(
    'testExecutionModule',
    [
      {
        properties: {
          awsAccountId: AWS_ACCOUNT_ID,
          awsRegionId: AWS_REGION_ID,
          cpu: 256,
          deploymentTag: 'v1',
          environmentVariables: [],
          family: 'backend',
          images: [
            {
              command: [],
              essential: true,
              name: 'test-container',
              ports: [
                { containerPort: 80, protocol: 'tcp' },
                { containerPort: 8080, protocol: 'tcp' },
              ],
              uri: '',
            },
            {
              command: [],
              essential: true,
              name: 'side-container',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: '',
            },
          ],
          memory: 512,
        },
        resourceContext: '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1',
        response: {
          revision: '1',
          taskDefinitionArn: 'taskDefinitionArn',
        },
        schema: EcsTaskDefinitionSchema,
        terraform: true,
      },
    ],
    { save: true },
  );

  const ecsCluster = ecsClusterResource as AResource<EcsClusterSchema, any>;
  const ecsTaskDefinition = ecsTaskDefinitionResource as AResource<EcsTaskDefinitionSchema, any>;
  const publicSubnet = subnet1Resource as AResource<SubnetSchema, any>;

  const ecsService = new EcsService(
    'ecs-service-backend-v1-region-qa-public-subnet-1',
    {
      assignPublicIp: 'ENABLED',
      awsAccountId: AWS_ACCOUNT_ID,
      awsRegionId: AWS_REGION_ID,
      desiredCount: 1,
      loadBalancers: [],
      serviceName: 'backend',
    },
    [new MatchingResource(ecsCluster), new MatchingResource(ecsTaskDefinition), new MatchingResource(publicSubnet)],
  );
  await testModuleContainer.createResources('testExecutionModule', [ecsService], { save: true });

  return { account, app, region };
}

describe('AwsEcsAlbServiceModule E2E', () => {
  let terraformUtility: TerraformUtility;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();
    terraformUtility = await container.get(TerraformUtility);

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
      inputs: {
        albName: 'test-alb',
        listeners: [
          {
            DefaultActions: [
              {
                action: {
                  TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                },
                actionType: 'forward',
              },
            ],
            Port: 80,
            rules: [
              {
                actions: [
                  {
                    action: {
                      TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                    },
                    actionType: 'forward',
                  },
                ],
                conditions: [
                  {
                    condition: { Values: ['/api'] },
                    conditionType: 'path-pattern',
                  },
                ],
                Priority: 1,
              },
            ],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: HEALTH_CHECK_RESPONSE,
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    await terraformUtility.validate(outputDir);
    await terraformUtility.plan(outputDir);
  }, 300_000);
});
