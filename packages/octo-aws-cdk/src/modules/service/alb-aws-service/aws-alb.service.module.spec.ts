import { EC2Client } from '@aws-sdk/client-ec2';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Region,
  type Subnet,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema, VpcSchema } from '../../../modules/region/per-az-aws-region/index.schema.js';
import type { SubnetSchema } from '../../../modules/subnet/simple-aws-subnet/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsAlbServiceModule } from './index.js';
import type { SecurityGroupSchema } from './index.schema.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region; subnet: Subnet }> {
  const {
    account: [account],
    app: [app],
    region: [region],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
    subnet: ['public-subnet'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );

  subnet.subnetType = SubnetType.PUBLIC;

  await testModuleContainer.createTestResources<[SubnetSchema, VpcSchema]>(
    'testModule',
    [
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
        region: stub('${{testModule.model.region}}'),
        subnets: [{ subnetCidrBlock: '10.0.0.0/24', subnetName: 'public-subnet' }],
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
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsAlbServiceModule>({
      inputs: {
        albName: 'test-alb',
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
