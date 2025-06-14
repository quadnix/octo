import { EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  MatchingResource,
  type Region,
  type Subnet,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { EcsServiceAnchorSchema } from '../../../anchors/ecs-service/ecs-service.anchor.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
// eslint-disable-next-line boundaries/element-types
import { EcsService } from '../../../resources/ecs-service/index.js';
import type { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import type { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsAlbServiceModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region; subnet: Subnet }> {
  const {
    account: [account],
    app: [app],
    execution: [execution],
    region: [region],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    execution: [':0:0:0'],
    region: ['region'],
    server: ['backend'],
    subnet: ['public-subnet'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  execution.addAnchor(
    testModuleContainer.createTestAnchor<EcsServiceAnchorSchema>(
      'EcsServiceAnchorSchema',
      {
        desiredCount: 1,
      },
      execution,
    ),
  );

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );

  subnet.subnetType = SubnetType.PUBLIC;

  const testResources = await testModuleContainer.createTestResources<
    [EcsClusterSchema, EcsTaskDefinitionSchema, SubnetSchema, VpcSchema]
  >(
    'testModule',
    [
      {
        resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
      },
      {
        resourceContext: '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet',
      },
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/24',
          subnetName: 'public-subnet',
        },
        resourceContext: '@octo/subnet=subnet-region-public-subnet',
        response: { SubnetId: 'SubnetId' },
      },
      {
        properties: {
          awsAccountId: '123',
          awsAvailabilityZones: ['us-east-1a'],
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/16',
          InstanceTenancy: 'default',
        },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  const ecsService = new EcsService(
    'ecs-service-backend-v1-region-qa-public-subnet',
    {
      assignPublicIp: 'ENABLED',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      desiredCount: 1,
      loadBalancers: [],
      serviceName: 'backend',
    },
    [
      new MatchingResource(testResources['@octo/ecs-cluster=ecs-cluster-region-qa']),
      new MatchingResource(
        testResources['@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet'],
      ),
      new MatchingResource(testResources['@octo/subnet=subnet-region-public-subnet']),
    ],
  );
  await testModuleContainer.createResources('testModule', [ecsService], { save: true });

  return { account, app, region, subnet };
}

describe('AwsAlbServiceModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EC2Client,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
          {
            metadata: { package: '@octo' },
            type: ElasticLoadBalancingV2Client,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0 });
    });

    // Register resource captures.
    testModuleContainer.registerCapture<SecurityGroupSchema>('@octo/security-group=sec-grp-region-test-alb', {
      GroupId: 'GroupId',
      Rules: { egress: [], ingress: [] },
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAlbServiceModule>({
      inputs: {
        albName: 'test-alb',
        listeners: [
          {
            DefaultActions: [
              {
                action: { ContentType: 'text/plain', MessageBody: 'Not Found!', StatusCode: 404 },
                actionType: 'fixed-response',
              },
            ],
            Port: 80,
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [{ subnetCidrBlock: '10.0.0.0/24', subnetName: 'public-subnet' }],
        targets: [
          { containerName: 'test-container', containerPort: 80, execution: stub('${{testModule.model.execution}}') },
        ],
      },
      moduleId: 'alb-module',
      type: AwsAlbServiceModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['alb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAlbServiceModelAction",
       ],
       [
         "AddTargetGroupOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSecurityGroupResourceAction",
       ],
       [
         "AddAlbResourceAction",
       ],
       [
         "AddAlbListenerResourceAction",
       ],
       [
         "UpdateAlbListenerResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAlbServiceModule>({
      inputs: {
        albName: 'test-alb',
        listeners: [],
        region: stub('${{testModule.model.region}}'),
        subnets: [{ subnetCidrBlock: '10.0.0.0/24', subnetName: 'public-subnet' }],
      },
      moduleId: 'alb-module',
      type: AwsAlbServiceModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-region-test-alb",
           "value": "@octo/security-group=sec-grp-region-test-alb",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/alb=alb-region-test-alb",
           "value": "@octo/alb=alb-region-test-alb",
         },
       ],
       [],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-region-test-alb",
           "value": "@octo/security-group=sec-grp-region-test-alb",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/alb=alb-region-test-alb",
           "value": "@octo/alb=alb-region-test-alb",
         },
       ],
       [],
     ]
    `);
  });
});
