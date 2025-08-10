import { EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient } from '@aws-sdk/client-ecs';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import {
  type AResource,
  type Account,
  type App,
  MatchingResource,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import type { AwsEcsServiceAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { type AlbListenerSchema } from '../../../resources/alb-listener/index.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
// eslint-disable-next-line boundaries/element-types
import { EcsService } from '../../../resources/ecs-service/index.js';
import type { EcsServiceSchema } from '../../../resources/ecs-service/index.schema.js';
import type { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import type { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsEcsAlbServiceModule } from './index.js';

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
    account: ['aws,123'],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    region: ['region'],
    server: ['backend'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

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
        awsRegionId: 'us-east-1',
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

  const testModuleResources = await testModuleContainer.createTestResources<[EcsClusterSchema, VpcSchema]>(
    'testModule',
    [
      {
        properties: {
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          clusterName: 'region-qa',
        },
        resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
        response: {
          clusterArn: 'clusterArn',
        },
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
  const testSubnet1ModuleResources = await testModuleContainer.createTestResources<[SubnetSchema]>(
    'testSubnet1Module',
    [
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/24',
          subnetName: 'public-subnet-1',
        },
        resourceContext: '@octo/subnet=subnet-region-public-subnet-1',
        response: { SubnetId: 'SubnetId' },
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
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          CidrBlock: '10.1.0.0/24',
          subnetName: 'public-subnet-2',
        },
        resourceContext: '@octo/subnet=subnet-region-public-subnet-2',
        response: { SubnetId: 'SubnetId' },
      },
    ],
    { save: true },
  );
  const testExecutionModuleResources = await testModuleContainer.createTestResources<[EcsTaskDefinitionSchema]>(
    'testExecutionModule',
    [
      {
        properties: {
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          cpu: 256,
          deploymentTag: 'v1',
          environmentVariables: [],
          family: 'backend',
          images: [
            {
              command: [],
              essential: true,
              name: 'test-container',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: '',
            },
          ],
          memory: 512,
        },
        resourceContext: '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1',
        response: {
          revision: 1,
          taskDefinitionArn: 'taskDefinitionArn',
        },
      },
    ],
    { save: true },
  );
  const ecsCluster = testModuleResources['@octo/ecs-cluster=ecs-cluster-region-qa'] as AResource<EcsClusterSchema, any>;
  const ecsTaskDefinition = testExecutionModuleResources[
    '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1'
  ] as AResource<EcsTaskDefinitionSchema, any>;
  const publicSubnet = testSubnet1ModuleResources['@octo/subnet=subnet-region-public-subnet-1'] as AResource<
    SubnetSchema,
    any
  >;

  const ecsService = new EcsService(
    'ecs-service-backend-v1-region-qa-public-subnet-1',
    {
      assignPublicIp: 'ENABLED',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      desiredCount: 1,
      loadBalancers: [],
      serviceName: 'backend',
    },
    [new MatchingResource(ecsCluster), new MatchingResource(ecsTaskDefinition), new MatchingResource(publicSubnet)],
  );
  await testModuleContainer.createResources('testExecutionModule', [ecsService], { save: true });

  return { account, app, region };
}

describe('AwsEcsAlbServiceModule UT', () => {
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
            type: ECSClient,
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
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
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
    testModuleContainer.registerCapture<AlbListenerSchema>('@octo/alb-listener=alb-listener-test-alb', {
      ListenerArn: 'ListenerArn',
      Rules: [
        { Priority: 1, RuleArn: 'RuleArn1' },
        { Priority: 2, RuleArn: 'RuleArn2' },
      ],
    });
    testModuleContainer.registerCapture<EcsServiceSchema>(
      '@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1',
      {
        serviceArn: 'serviceArn',
      },
    );
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
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['alb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsAlbServiceModelAction",
       ],
       [
         "AddAwsEcsAlbServiceOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSecurityGroupResourceAction",
         "AddAlbTargetGroupResourceAction",
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
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
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
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
           "value": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": "@octo/alb-listener=alb-listener-test-alb",
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "DefaultActions": [],
           },
         },
       ],
       [
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": "",
         },
       ],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);
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
                    action: { ContentType: 'text/plain', MessageBody: 'Not implemented!', StatusCode: 404 },
                    actionType: 'fixed-response',
                  },
                ],
                conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "Rule": {
               "action": "add",
               "rule": {
                 "Priority": 1,
                 "actions": [
                   {
                     "action": {
                       "ContentType": "text/plain",
                       "MessageBody": "Not implemented!",
                       "StatusCode": 404,
                     },
                     "actionType": "fixed-response",
                   },
                 ],
                 "conditions": [
                   {
                     "condition": {
                       "Values": [
                         "/api",
                       ],
                     },
                     "conditionType": "path-pattern",
                   },
                 ],
               },
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
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
                    action: { TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }] },
                    actionType: 'forward',
                  },
                ],
                conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
                Priority: 2,
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "Rule": {
               "RuleArn": "RuleArn1",
               "action": "delete",
               "rule": {
                 "Priority": 1,
                 "actions": [
                   {
                     "action": {
                       "ContentType": "text/plain",
                       "MessageBody": "Not implemented!",
                       "StatusCode": 404,
                     },
                     "actionType": "fixed-response",
                   },
                 ],
                 "conditions": [
                   {
                     "condition": {
                       "Values": [
                         "/api",
                       ],
                     },
                     "conditionType": "path-pattern",
                   },
                 ],
               },
             },
           },
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "Rule": {
               "action": "add",
               "rule": {
                 "Priority": 2,
                 "actions": [
                   {
                     "action": {
                       "TargetGroups": [
                         {
                           "Weight": 100,
                           "targetGroupName": "test-container-80",
                         },
                       ],
                     },
                     "actionType": "forward",
                   },
                 ],
                 "conditions": [
                   {
                     "condition": {
                       "Values": [
                         "/api",
                       ],
                     },
                     "conditionType": "path-pattern",
                   },
                 ],
               },
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: app4 } = await setup(testModuleContainer);
    const result4 = await testModuleContainer.commit(app4, { enableResourceCapture: true });
    expect(result4.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
           "value": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-region-test-alb",
           "value": "@octo/security-group=sec-grp-region-test-alb",
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": "",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/alb=alb-region-test-alb",
           "value": "@octo/alb=alb-region-test-alb",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": "@octo/alb-listener=alb-listener-test-alb",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: app1 } = await setup(testModuleContainer);
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
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
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
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
           "value": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": "@octo/alb-listener=alb-listener-test-alb",
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "DefaultActions": [],
           },
         },
       ],
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": {
             "add": {
               "tag1": "value1",
             },
             "delete": [],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "resourceId",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": "",
         },
       ],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: app2 } = await setup(testModuleContainer);
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
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-region-test-alb",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb=alb-region-test-alb",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
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
            rules: [],
          },
        ],
        region: stub('${{testModule.model.region}}'),
        subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
        targets: [
          {
            containerName: 'test-container',
            containerPort: 80,
            execution: stub('${{testExecutionModule.model.execution}}'),
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/security-group=sec-grp-region-test-alb",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb=alb-region-test-alb",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/alb-listener=alb-listener-test-alb",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);
  });
});
