import { EC2Client } from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import { type Container, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import type { InternetGateway } from '../../../resources/internet-gateway/index.js';
import type { SecurityGroup } from '../../../resources/security-group/index.js';
import type { Vpc } from '../../../resources/vpc/index.js';
import { AwsRegionModule } from './aws-region.module.js';
import { AddRegionModelAction } from './models/region/actions/add-region.model.action.js';
import { RegionId } from './models/region/index.js';

describe('AwsRegionModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
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
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call AddRegionModelAction with correct inputs', async () => {
    const addRegionModelAction = await container.get(AddRegionModelAction);
    const addRegionModelActionSpy = jest.spyOn(addRegionModelAction, 'handle');

    testModuleContainer.registerCapture<Vpc>('@octo/vpc=vpc-aws-us-east-1a', { VpcId: 'VpcId' });
    testModuleContainer.registerCapture<InternetGateway>('@octo/internet-gateway=igw-aws-us-east-1a', {
      InternetGatewayId: 'InternetGatewayId',
    });
    testModuleContainer.registerCapture<SecurityGroup>('@octo/security-group=sec-grp-aws-us-east-1a-access', {
      GroupId: 'GroupId',
      Rules: {
        egress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
        ingress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
      },
    });

    // Create an app and account.
    const {
      account: [account],
      app: [app],
    } = await testModuleContainer.createTestModels('testModule', { account: ['aws,account'], app: ['test-app'] });
    jest.spyOn(account, 'getCredentials').mockReturnValue({});

    // Create a region.
    await testModuleContainer.runModule<AwsRegionModule>({
      inputs: {
        account: '${{testModule.model.account}}',
        regionId: RegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsRegionModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addRegionModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addRegionModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "account": {
           "accountId": "account",
           "accountType": "aws",
           "context": "account=account,app=test-app",
         },
         "regionId": "aws-us-east-1a",
         "vpcCidrBlock": "10.0.0.0/8",
       },
       "models": {
         "region": {
           "awsRegionAZ": "us-east-1a",
           "awsRegionId": "us-east-1",
           "context": "region=aws-us-east-1a,account=account,app=test-app",
           "regionId": "aws-us-east-1a",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);
  });

  it('should create and delete a new region', async () => {
    testModuleContainer.registerCapture<Vpc>('@octo/vpc=vpc-aws-us-east-1a', { VpcId: 'VpcId' });
    testModuleContainer.registerCapture<InternetGateway>('@octo/internet-gateway=igw-aws-us-east-1a', {
      InternetGatewayId: 'InternetGatewayId',
    });
    testModuleContainer.registerCapture<SecurityGroup>('@octo/security-group=sec-grp-aws-us-east-1a-access', {
      GroupId: 'GroupId',
      Rules: {
        egress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
        ingress: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }],
      },
    });

    // Create an app and account.
    const {
      account: [account1],
      app: [app1],
    } = await testModuleContainer.createTestModels('testModule', { account: ['aws,account'], app: ['test-app'] });
    jest.spyOn(account1, 'getCredentials').mockReturnValue({});

    // Create a region.
    await testModuleContainer.runModule<AwsRegionModule>({
      inputs: {
        account: '${{testModule.model.account}}',
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

    // Create an app and account.
    const {
      account: [account2],
      app: [app2],
    } = await testModuleContainer.createTestModels('testModule', { account: ['aws,account'], app: ['test-app'] });
    jest.spyOn(account2, 'getCredentials').mockReturnValue({});

    // Commit without creation the region. This should yield the previous region being deleted.
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
