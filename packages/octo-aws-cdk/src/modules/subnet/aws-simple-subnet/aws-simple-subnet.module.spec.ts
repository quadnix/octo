import {
  AllocateAddressCommand,
  AssociateRouteTableCommand,
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateNatGatewayCommand,
  CreateNetworkAclCommand,
  CreateRouteTableCommand,
  CreateSecurityGroupCommand,
  CreateSubnetCommand,
  DescribeNatGatewaysCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import {
  CreateFileSystemCommand,
  CreateMountTargetCommand,
  DescribeFileSystemsCommand,
  DescribeMountTargetsCommand,
  EFSClient,
  type FileSystemDescription,
} from '@aws-sdk/client-efs';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import {
  type AResource,
  type Account,
  type App,
  type BaseResourceSchema,
  type Filesystem,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsSimpleSubnetModule } from './index.js';

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
    testModuleContainer.createTestAnchor<AwsEfsAnchorSchema>(
      'AwsEfsAnchor',
      { filesystemName: 'test-filesystem' },
      filesystem,
    ),
  );
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

  await testModuleContainer.createTestResources<[EfsSchema, InternetGatewaySchema, VpcSchema]>(
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

describe('AwsSimpleSubnetModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const EC2ClientMock = mockClient(EC2Client);
  const EFSClientMock = mockClient(EFSClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    EC2ClientMock.on(CreateSubnetCommand, { CidrBlock: '10.0.1.0/24' })
      .resolves({
        Subnet: {
          SubnetId: 'SubnetId-Private',
        },
      })
      .on(CreateSubnetCommand, { CidrBlock: '10.0.0.0/24' })
      .resolves({
        Subnet: {
          SubnetId: 'SubnetId-Public',
        },
      })
      .on(CreateSecurityGroupCommand)
      .resolves({
        GroupId: 'GroupId',
      })
      .on(AuthorizeSecurityGroupEgressCommand)
      .resolves({ SecurityGroupRules: [] })
      .on(AuthorizeSecurityGroupIngressCommand)
      .resolves({ SecurityGroupRules: [] })
      .on(CreateRouteTableCommand)
      .resolves({ RouteTable: { RouteTableId: 'RouteTableId' } })
      .on(AssociateRouteTableCommand, { SubnetId: 'SubnetId-Private' })
      .resolves({ AssociationId: 'subnetAssociationId-Private' })
      .on(AssociateRouteTableCommand, { SubnetId: 'SubnetId-Public' })
      .resolves({ AssociationId: 'subnetAssociationId-Public' })
      .on(DescribeNetworkAclsCommand, {
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: ['SubnetId-Private'],
          },
        ],
      })
      .resolves({
        NetworkAcls: [
          {
            Associations: [{ NetworkAclAssociationId: 'defaultNetworkAclId-Private', SubnetId: 'SubnetId-Private' }],
            Entries: [],
            NetworkAclId: 'defaultNetworkAclId-Private',
          },
        ],
      })
      .on(DescribeNetworkAclsCommand, {
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: ['SubnetId-Public'],
          },
        ],
      })
      .resolves({
        NetworkAcls: [
          {
            Associations: [{ NetworkAclAssociationId: 'defaultNetworkAclId-Public', SubnetId: 'SubnetId-Public' }],
            Entries: [],
            NetworkAclId: 'defaultNetworkAclId-Public',
          },
        ],
      })
      .on(CreateNetworkAclCommand)
      .resolves({ NetworkAcl: { NetworkAclId: 'NetworkAclId' } })
      .on(ReplaceNetworkAclAssociationCommand, { AssociationId: 'defaultNetworkAclId-Private' })
      .resolves({ NewAssociationId: 'subnetNetworkAclId-Private' })
      .on(ReplaceNetworkAclAssociationCommand, { AssociationId: 'defaultNetworkAclId-Public' })
      .resolves({ NewAssociationId: 'subnetNetworkAclId-Public' })
      .on(AllocateAddressCommand)
      .resolves({ AllocationId: 'AllocationId' })
      .on(CreateNatGatewayCommand)
      .resolves({ NatGateway: { NatGatewayId: 'NatGatewayId' } })
      .on(DescribeNatGatewaysCommand)
      .resolvesOnce({ NatGateways: [{ State: 'available' }] })
      .resolves({ NatGateways: [{ State: 'deleted' }] });

    EFSClientMock.on(CreateFileSystemCommand)
      .resolves({ FileSystemId: 'FileSystemId' })
      .on(DescribeFileSystemsCommand)
      .resolves({
        FileSystems: [{ FileSystemId: 'FileSystemId', LifeCycleState: 'available' } as FileSystemDescription],
      })
      .on(CreateMountTargetCommand)
      .resolves({ MountTargetId: 'MountTargetId', NetworkInterfaceId: 'NetworkInterfaceId' })
      .on(DescribeMountTargetsCommand)
      .callsFake(() => {
        const states = ['available', 'deleted'];
        return {
          MountTargets: [
            { FileSystemId: 'FileSystemId', LifeCycleState: states[Math.floor(Math.random() * states.length)] },
          ],
        };
      });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EC2Client,
            value: EC2ClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: EFSClient,
            value: EFSClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, {
        ...options,
        initialDelayInMs: 0,
        maxRetries: 15,
        retryDelayInMs: 0,
        throwOnError: true,
      });
    });
  });

  afterEach(async () => {
    EC2ClientMock.reset();
    EFSClientMock.reset();
    ResourceGroupsTaggingAPIClientMock.reset();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        localFilesystems: [stub('${{testModule.model.filesystem}}')],
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['subnet'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsSimpleSubnetModelAction",
       ],
       [
         "AddAwsSimpleSubnetLocalFilesystemMountOverlayAction",
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
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
    expect((result1.resourceDiffs[0][2].diff.node as AResource<BaseResourceSchema, any>).properties)
      .toMatchInlineSnapshot(`
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
            subnet: stub('${{subnet1.model.subnet}}'),
          },
        ],
      },
      moduleId: 'subnet2',
      type: AwsSimpleSubnetModule,
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
    expect((result1.resourceDiffs[0][2].diff.node as AResource<BaseResourceSchema, any>).properties)
      .toMatchInlineSnapshot(`
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
    expect((result1.resourceDiffs[0][5].diff.node as AResource<BaseResourceSchema, any>).properties)
      .toMatchInlineSnapshot(`
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet1',
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [
          {
            attachToNatGateway: true,
            subnet: stub('${{subnet1.model.subnet}}'),
          },
        ],
      },
      moduleId: 'subnet2',
      type: AwsSimpleSubnetModule,
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
    expect((result1.resourceDiffs[0][3].diff.node as AResource<BaseResourceSchema, any>).properties)
      .toMatchInlineSnapshot(`
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
    expect((result1.resourceDiffs[0][7].diff.node as AResource<BaseResourceSchema, any>).properties)
      .toMatchInlineSnapshot(`
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [],
      },
      moduleId: 'subnet2',
      type: AwsSimpleSubnetModule,
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
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
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
        subnetSiblings: [],
      },
      moduleId: 'subnet2',
      type: AwsSimpleSubnetModule,
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

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
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

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/subnet=subnet-region-private-subnet",
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
           "node": "@octo/network-acl=nacl-region-private-subnet",
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
           "node": "@octo/route-table=rt-region-private-subnet",
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/subnet=subnet-region-private-subnet",
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
           "node": "@octo/network-acl=nacl-region-private-subnet",
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
           "node": "@octo/route-table=rt-region-private-subnet",
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
