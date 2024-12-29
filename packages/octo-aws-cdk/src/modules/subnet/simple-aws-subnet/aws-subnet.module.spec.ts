import { EC2Client } from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Container,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddNetworkAclResourceAction } from '../../../resources/network-acl/actions/add-network-acl.resource.action.js';
import type { NetworkAcl } from '../../../resources/network-acl/index.js';
import { AddRouteTableResourceAction } from '../../../resources/route-table/actions/add-route-table.resource.action.js';
import { AddSubnetResourceAction } from '../../../resources/subnet/actions/add-subnet.resource.action.js';
import { AwsSubnetModule } from './aws-subnet.module.js';
import { AddSubnetModelAction } from './models/subnet/actions/add-subnet.model.action.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,account'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [
      { resourceContext: '@octo/internet-gateway=igw-aws-us-east-1a' },
      {
        properties: { awsAvailabilityZones: ['us-east-1a'], awsRegionId: 'us-east-1' },
        resourceContext: '@octo/vpc=vpc-aws-us-east-1a',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  return { account, app, region };
}

describe('AwsSubnetModule UT', () => {
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
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addSubnetModelAction = await container.get(AddSubnetModelAction);
    const addSubnetModelActionSpy = jest.spyOn(addSubnetModelAction, 'handle');
    const addNetworkAclResourceAction = await container.get(AddNetworkAclResourceAction);
    const addNetworkAclResourceActionSpy = jest.spyOn(addNetworkAclResourceAction, 'handle');
    const addRouteTableResourceAction = await container.get(AddRouteTableResourceAction);
    const addRouteTableResourceActionSpy = jest.spyOn(addRouteTableResourceAction, 'handle');
    const addSubnetResourceAction = await container.get(AddSubnetResourceAction);
    const addSubnetResourceActionSpy = jest.spyOn(addSubnetResourceAction, 'handle');

    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'test-private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSubnetModule,
    });

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addSubnetModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addSubnetModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "region": {
           "context": "region=region,account=account,app=test-app",
           "regionId": "region",
         },
         "subnetAvailabilityZone": "us-east-1a",
         "subnetCidrBlock": "10.0.0.0/24",
         "subnetName": "test-private-subnet",
         "subnetOptions": {
           "disableSubnetIntraNetwork": false,
           "subnetType": "private",
         },
         "subnetSiblings": [],
       },
       "models": {
         "subnet": {
           "context": "subnet=region-test-private-subnet,region=region,account=account,app=test-app",
           "options": {
             "disableSubnetIntraNetwork": false,
             "subnetType": "private",
           },
           "region": {
             "context": "region=region,account=account,app=test-app",
           },
           "subnetId": "region-test-private-subnet",
           "subnetName": "test-private-subnet",
         },
       },
       "overlays": {},
       "resources": {},
     }
    `);

    expect(addSubnetResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addSubnetResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/subnet=subnet-region-test-private-subnet",
       "value": "@octo/subnet=subnet-region-test-private-subnet",
     }
    `);

    expect(addRouteTableResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addRouteTableResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/route-table=rt-region-test-private-subnet",
       "value": "@octo/route-table=rt-region-test-private-subnet",
     }
    `);

    expect(addNetworkAclResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addNetworkAclResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/network-acl=nacl-region-test-private-subnet",
       "value": "@octo/network-acl=nacl-region-test-private-subnet",
     }
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'test-private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSubnetModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-test-private-subnet",
           "value": "@octo/subnet=subnet-region-test-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-test-private-subnet",
           "value": "@octo/route-table=rt-region-test-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-test-private-subnet",
           "value": "@octo/network-acl=nacl-region-test-private-subnet",
         },
       ],
       [],
     ]
    `);
    expect((result1.resourceDiffs[0][2].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsRegionId": "us-east-1",
       "entries": [],
     }
    `);

    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'test-private-subnet',
        subnetOptions: {
          disableSubnetIntraNetwork: true,
          subnetType: SubnetType.PRIVATE,
        },
      },
      moduleId: 'subnet',
      type: AwsSubnetModule,
    });

    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/network-acl=nacl-region-test-private-subnet",
           "value": {
             "key": "entries",
             "value": [
               {
                 "CidrBlock": "10.0.0.0/24",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "deny",
                 "RuleNumber": 1,
               },
               {
                 "CidrBlock": "10.0.0.0/24",
                 "Egress": true,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "deny",
                 "RuleNumber": 1,
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-test-private-subnet",
           "value": "@octo/subnet=subnet-region-test-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-test-private-subnet",
           "value": "@octo/route-table=rt-region-test-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-test-private-subnet",
           "value": "@octo/network-acl=nacl-region-test-private-subnet",
         },
       ],
       [],
     ]
    `);
  });

  it('should associate subnet with siblings', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'test-private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'test-public-subnet',
        subnetOptions: {
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
        subnetSiblings: [
          {
            subnetCidrBlock: stub('${{subnet1.input.subnetCidrBlock}}'),
            subnetName: stub('${{subnet1.input.subnetName}}'),
          },
        ],
      },
      moduleId: 'subnet2',
      type: AwsSubnetModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-test-private-subnet",
           "value": "@octo/subnet=subnet-region-test-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-test-private-subnet",
           "value": "@octo/route-table=rt-region-test-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-test-private-subnet",
           "value": "@octo/network-acl=nacl-region-test-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-test-public-subnet",
           "value": "@octo/subnet=subnet-region-test-public-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-test-public-subnet",
           "value": "@octo/route-table=rt-region-test-public-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-test-public-subnet",
           "value": "@octo/network-acl=nacl-region-test-public-subnet",
         },
       ],
       [],
     ]
    `);
    expect((result1.resourceDiffs[0][5].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsRegionId": "us-east-1",
       "entries": [
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 1,
         },
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": true,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 1,
         },
         {
           "CidrBlock": "10.0.0.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 11,
         },
         {
           "CidrBlock": "10.0.0.0/24",
           "Egress": true,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 11,
         },
       ],
     }
    `);
  });
});
