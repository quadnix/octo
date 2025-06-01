import { EC2Client } from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import { type Account, type App, TestContainer, TestModuleContainer, TestStateProvider, stub } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsRegionModule } from './index.js';
import { type InternetGatewaySchema, RegionId, type SecurityGroupSchema, type VpcSchema } from './index.schema.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { account: ['aws,123'], app: ['test-app'] });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});
  return { account, app };
}

describe('AwsRegionModule UT', () => {
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
    testModuleContainer.registerCapture<VpcSchema>('@octo/vpc=vpc-aws-us-east-1a', { VpcId: 'VpcId' });
    testModuleContainer.registerCapture<InternetGatewaySchema>('@octo/internet-gateway=igw-aws-us-east-1a', {
      InternetGatewayId: 'InternetGatewayId',
    });
    testModuleContainer.registerCapture<SecurityGroupSchema>('@octo/security-group=sec-grp-aws-us-east-1a-access', {
      GroupId: 'GroupId',
      Rules: {
        egress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
        ingress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
      },
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        regionId: RegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsRegionModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['region'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddRegionModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddVpcResourceAction",
       ],
       [
         "AddInternetGatewayResourceAction",
         "AddSecurityGroupResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        regionId: RegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsRegionModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/vpc=vpc-aws-us-east-1a",
           "value": "@octo/vpc=vpc-aws-us-east-1a",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-aws-us-east-1a",
           "value": "@octo/internet-gateway=igw-aws-us-east-1a",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-aws-us-east-1a-access",
           "value": "@octo/security-group=sec-grp-aws-us-east-1a-access",
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
           "node": "@octo/vpc=vpc-aws-us-east-1a",
           "value": "@octo/vpc=vpc-aws-us-east-1a",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/internet-gateway=igw-aws-us-east-1a",
           "value": "@octo/internet-gateway=igw-aws-us-east-1a",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/security-group=sec-grp-aws-us-east-1a-access",
           "value": "@octo/security-group=sec-grp-aws-us-east-1a-access",
         },
       ],
       [],
     ]
    `);
  });
});
