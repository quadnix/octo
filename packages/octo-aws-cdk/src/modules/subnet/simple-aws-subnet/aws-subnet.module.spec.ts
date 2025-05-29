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
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { EfsFilesystemAnchor } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.js';
import type { EfsMountTargetSchema } from '../../../resources/efs-mount-target/efs-mount-target.schema.js';
import type { NetworkAcl } from '../../../resources/network-acl/index.js';
import type { NetworkAclSchema } from '../../../resources/network-acl/network-acl.schema.js';
import type { RouteTableSchema } from '../../../resources/route-table/route-table.schema.js';
import type { SecurityGroupSchema } from '../../../resources/security-group/security-group.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/subnet.schema.js';
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

  filesystem.addAnchor(
    new EfsFilesystemAnchor('EfsFilesystemAnchor', { filesystemName: 'test-filesystem' }, filesystem),
  );
  region.addAnchor(
    new AwsRegionAnchor(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a' },
      region,
    ),
  );

  await testModuleContainer.createTestResources(
    'testModule',
    [
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
      },
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', internetGatewayName: 'default' },
        resourceContext: '@octo/internet-gateway=igw-region',
        response: { InternetGatewayId: 'InternetGatewayId' },
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
    testModuleContainer.registerCapture<EfsMountTargetSchema>(
      '@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem',
      {
        MountTargetId: 'MountTargetId',
        NetworkInterfaceId: 'NetworkInterfaceId',
      },
    );
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
    testModuleContainer.registerCapture<SecurityGroupSchema>(
      '@octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem',
      {
        GroupId: 'GroupId',
        Rules: { egress: [], ingress: [] },
      },
    );
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
        subnetCidrBlock: '10.0.1.0/24',
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
         "AddSecurityGroupResourceAction",
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
        subnetCidrBlock: '10.0.1.0/24',
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
       "entries": [
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 10,
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
           "RuleNumber": 10,
         },
       ],
     }
    `);

    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetOptions: {
          createNatGateway: false,
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
                 "CidrBlock": "10.0.1.0/24",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "deny",
                 "RuleNumber": 10,
               },
               {
                 "CidrBlock": "10.0.1.0/24",
                 "Egress": true,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "deny",
                 "RuleNumber": 10,
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
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetOptions: {
          createNatGateway: false,
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
           "node": "@octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
         },
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
           "node": "@octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/subnet=subnet-region-private-subnet",
           "value": "@octo/subnet=subnet-region-private-subnet",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
           "value": "@octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
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
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/route-table=rt-region-private-subnet",
         },
       ],
       [],
     ]
    `);
  });

  it('should associate and disassociate subnet with siblings', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'public-subnet',
        subnetOptions: {
          createNatGateway: false,
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
        subnetSiblings: [
          {
            attachToNatGateway: false,
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
    expect((result1.resourceDiffs[0][2].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
       "awsRegionId": "us-east-1",
       "entries": [
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 10,
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
           "RuleNumber": 10,
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
           "RuleNumber": 20,
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
           "RuleNumber": 20,
         },
       ],
     }
    `);
    expect((result1.resourceDiffs[0][5].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
       "awsRegionId": "us-east-1",
       "entries": [
         {
           "CidrBlock": "10.0.0.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 10,
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
           "RuleNumber": 10,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 20,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": true,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 20,
         },
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 30,
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
           "RuleNumber": 30,
         },
       ],
     }
    `);

    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'public-subnet',
        subnetOptions: {
          createNatGateway: false,
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
        subnetSiblings: [],
      },
      moduleId: 'subnet2',
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
                 "CidrBlock": "10.0.1.0/24",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 10,
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
                 "RuleNumber": 10,
               },
             ],
           },
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/network-acl=nacl-region-public-subnet",
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
                 "RuleAction": "allow",
                 "RuleNumber": 10,
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
                 "RuleNumber": 10,
               },
               {
                 "CidrBlock": "0.0.0.0/0",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 20,
               },
               {
                 "CidrBlock": "0.0.0.0/0",
                 "Egress": true,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 20,
               },
             ],
           },
         },
       ],
       [],
     ]
    `);
  });

  it('should associate and disassociate private subnet with public subnet with a NAT Gateway', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'public-subnet',
        subnetOptions: {
          createNatGateway: true,
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [
          {
            attachToNatGateway: true,
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
           "node": "@octo/subnet=subnet-region-public-subnet",
           "value": "@octo/subnet=subnet-region-public-subnet",
         },
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/nat-gateway=nat-gateway-region-public-subnet",
           "value": "@octo/nat-gateway=nat-gateway-region-public-subnet",
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
           "field": "parent",
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/nat-gateway=nat-gateway-region-public-subnet",
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
    expect((result1.resourceDiffs[0][3].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
       "awsRegionId": "us-east-1",
       "entries": [
         {
           "CidrBlock": "10.0.0.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 10,
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
           "RuleNumber": 10,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 20,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": true,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 20,
         },
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 30,
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
           "RuleNumber": 30,
         },
       ],
     }
    `);
    expect((result1.resourceDiffs[0][7].diff.node as NetworkAcl).properties).toMatchInlineSnapshot(`
     {
       "awsAccountId": "123",
       "awsRegionId": "us-east-1",
       "entries": [
         {
           "CidrBlock": "10.0.1.0/24",
           "Egress": false,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 10,
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
           "RuleNumber": 10,
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
           "RuleNumber": 20,
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
           "RuleNumber": 20,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": true,
           "PortRange": {
             "From": -1,
             "To": -1,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 30,
         },
         {
           "CidrBlock": "0.0.0.0/0",
           "Egress": false,
           "PortRange": {
             "From": 1024,
             "To": 65535,
           },
           "Protocol": "-1",
           "RuleAction": "allow",
           "RuleNumber": 30,
         },
       ],
     }
    `);

    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'public-subnet',
        subnetOptions: {
          createNatGateway: true,
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [],
      },
      moduleId: 'subnet2',
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
                 "CidrBlock": "10.0.1.0/24",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 10,
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
                 "RuleNumber": 10,
               },
             ],
           },
         },
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/network-acl=nacl-region-public-subnet",
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
                 "RuleAction": "allow",
                 "RuleNumber": 10,
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
                 "RuleNumber": 10,
               },
               {
                 "CidrBlock": "0.0.0.0/0",
                 "Egress": false,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 20,
               },
               {
                 "CidrBlock": "0.0.0.0/0",
                 "Egress": true,
                 "PortRange": {
                   "From": -1,
                   "To": -1,
                 },
                 "Protocol": "-1",
                 "RuleAction": "allow",
                 "RuleNumber": 20,
               },
             ],
           },
         },
         {
           "action": "delete",
           "field": "parent",
           "node": "@octo/route-table=rt-region-private-subnet",
           "value": "@octo/nat-gateway=nat-gateway-region-public-subnet",
         },
       ],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.0.0/24',
        subnetName: 'public-subnet',
        subnetOptions: {
          createNatGateway: false,
          disableSubnetIntraNetwork: false,
          subnetType: SubnetType.PUBLIC,
        },
      },
      moduleId: 'subnet1',
      type: AwsSubnetModule,
    });
    await testModuleContainer.runModule<AwsSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [],
      },
      moduleId: 'subnet2',
      type: AwsSubnetModule,
    });

    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/nat-gateway=nat-gateway-region-public-subnet",
           "value": "@octo/nat-gateway=nat-gateway-region-public-subnet",
         },
       ],
       [],
     ]
    `);
  });
});
