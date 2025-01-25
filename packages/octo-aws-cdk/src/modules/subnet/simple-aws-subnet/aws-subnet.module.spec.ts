import { EC2Client } from '@aws-sdk/client-ec2';
import { EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Filesystem,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { type EfsMountTargetSchema } from '../../../resources/efs-mount-target/index.js';
import { type NetworkAcl, type NetworkAclSchema } from '../../../resources/network-acl/index.js';
import { type RouteTableSchema } from '../../../resources/route-table/index.js';
import { type SubnetSchema } from '../../../resources/subnet/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsSubnetModule } from './aws-subnet.module.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; filesystem: Filesystem; region: Region }> {
  const {
    account: [account],
    app: [app],
    filesystem: [filesystem],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    filesystem: ['test-filesystem'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  await testModuleContainer.createTestResources(
    'testModule',
    [
      {
        properties: { awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
      },
      {
        resourceContext: '@octo/internet-gateway=igw-region',
        response: { InternetGatewayId: 'InternetGatewayId' },
      },
      {
        properties: { awsAvailabilityZones: ['us-east-1a'], awsRegionId: 'us-east-1' },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
      },
    ],
    { save: true },
  );

  return { account, app, filesystem, region };
}

describe('AwsSubnetModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: EC2Client,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: EFSClient,
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
    testModuleContainer.registerCapture<EfsMountTargetSchema>('@octo/efs=efs-region-test-filesystem', {
      MountTargetId: 'MountTargetId',
      NetworkInterfaceId: 'NetworkInterfaceId',
    });
    testModuleContainer.registerCapture<SubnetSchema>('@octo/subnet=subnet-region-private-subnet', {
      SubnetId: 'SubnetId-Private',
    });
    testModuleContainer.registerCapture<SubnetSchema>('@octo/subnet=subnet-region-public-subnet', {
      SubnetId: 'SubnetId-Public',
    });
    testModuleContainer.registerCapture<RouteTableSchema>('@octo/route-table=rt-region-private-subnet', {
      RouteTableId: 'RouteTableId-Private',
      subnetAssociationId: 'subnetAssociationId-Private',
    });
    testModuleContainer.registerCapture<RouteTableSchema>('@octo/route-table=rt-region-public-subnet', {
      RouteTableId: 'RouteTableId-Public',
      subnetAssociationId: 'subnetAssociationId-Public',
    });
    testModuleContainer.registerCapture<NetworkAclSchema>('@octo/network-acl=nacl-region-private-subnet', {
      associationId: 'associationId-Private',
      defaultNetworkAclId: 'defaultNetworkAclId-Private',
      NetworkAclId: 'NetworkAclId-Private',
    });
    testModuleContainer.registerCapture<NetworkAclSchema>('@octo/network-acl=nacl-region-public-subnet', {
      associationId: 'associationId-Public',
      defaultNetworkAclId: 'defaultNetworkAclId-Public',
      NetworkAclId: 'NetworkAclId-Public',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        localFilesystems: [stub('${{testModule.model.filesystem}}')],
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSubnetModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['subnet'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSubnetModelAction",
       ],
       [
         "AddSubnetLocalFilesystemMountOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddSubnetResourceAction",
       ],
       [
         "AddRouteTableResourceAction",
         "AddNetworkAclResourceAction",
         "AddEfsMountTargetResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'private-subnet',
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
           "node": "@octo/subnet=subnet-region-private-subnet",
           "value": "@octo/subnet=subnet-region-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/route-table=rt-region-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-private-subnet",
           "value": "@octo/network-acl=nacl-region-private-subnet",
         },
       ],
       [],
     ]
    `);
    expect((result1.resourceDiffs[0][2].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
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
        subnetName: 'private-subnet',
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
           "node": "@octo/network-acl=nacl-region-private-subnet",
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
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        localFilesystems: [stub('${{testModule.model.filesystem}}')],
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'private-subnet',
        subnetOptions: {
          disableSubnetIntraNetwork: true,
          subnetType: SubnetType.PRIVATE,
        },
      },
      moduleId: 'subnet',
      type: AwsSubnetModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
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
           "node": "@octo/subnet=subnet-region-private-subnet",
           "value": "@octo/subnet=subnet-region-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/route-table=rt-region-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-private-subnet",
           "value": "@octo/network-acl=nacl-region-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
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
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'public-subnet',
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
           "node": "@octo/subnet=subnet-region-private-subnet",
           "value": "@octo/subnet=subnet-region-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/route-table=rt-region-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-private-subnet",
           "value": "@octo/network-acl=nacl-region-private-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-public-subnet",
           "value": "@octo/subnet=subnet-region-public-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/route-table=rt-region-public-subnet",
           "value": "@octo/route-table=rt-region-public-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/network-acl=nacl-region-public-subnet",
           "value": "@octo/network-acl=nacl-region-public-subnet",
         },
       ],
       [],
     ]
    `);
    expect((result1.resourceDiffs[0][5].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
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
