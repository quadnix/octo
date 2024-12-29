import { EC2Client } from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddInternetGatewayResourceAction } from '../../../resources/internet-gateway/actions/add-internet-gateway.resource.action.js';
import type { InternetGateway } from '../../../resources/internet-gateway/index.js';
import { AddSecurityGroupResourceAction } from '../../../resources/security-group/actions/add-security-group.resource.action.js';
import type { SecurityGroup } from '../../../resources/security-group/index.js';
import { AddVpcResourceAction } from '../../../resources/vpc/actions/add-vpc.resource.action.js';
import type { Vpc } from '../../../resources/vpc/index.js';
import { AwsRegionModule } from './aws-region.module.js';
import { AddRegionModelAction } from './models/region/actions/add-region.model.action.js';
import { RegionId } from './models/region/index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { account: ['aws,account'], app: ['test-app'] });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});
  return { account, app };
}

describe('AwsRegionModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsRegionId: 'us-east-1', package: '@octo' },
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

    // Register resource captures.
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
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addRegionModelAction = await container.get(AddRegionModelAction);
    const addRegionModelActionSpy = jest.spyOn(addRegionModelAction, 'handle');
    const addInternetGatewayResourceAction = await container.get(AddInternetGatewayResourceAction);
    const addInternetGatewayResourceActionSpy = jest.spyOn(addInternetGatewayResourceAction, 'handle');
    const addSecurityGroupResourceAction = await container.get(AddSecurityGroupResourceAction);
    const addSecurityGroupResourceActionSpy = jest.spyOn(addSecurityGroupResourceAction, 'handle');
    const addVpcResourceAction = await container.get(AddVpcResourceAction);
    const addVpcResourceActionSpy = jest.spyOn(addVpcResourceAction, 'handle');

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
           "awsRegionAZs": [
             "us-east-1a",
           ],
           "awsRegionId": "us-east-1",
           "context": "region=aws-us-east-1a,account=account,app=test-app",
           "regionId": "aws-us-east-1a",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(addVpcResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addVpcResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/vpc=vpc-aws-us-east-1a",
       "value": "@octo/vpc=vpc-aws-us-east-1a",
     }
    `);

    expect(addInternetGatewayResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addInternetGatewayResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/internet-gateway=igw-aws-us-east-1a",
       "value": "@octo/internet-gateway=igw-aws-us-east-1a",
     }
    `);

    expect(addSecurityGroupResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addSecurityGroupResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/security-group=sec-grp-aws-us-east-1a-access",
       "value": "@octo/security-group=sec-grp-aws-us-east-1a-access",
     }
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
