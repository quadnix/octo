import {
  type Account,
  type App,
  DiffAssert,
  type Filesystem,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsSimpleSubnetModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
  octoTerraform: OctoTerraform,
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
        awsRegionAZs: ['us-east-1a', 'us-east-1b'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  const {
    '@octo/efs=efs-region-test-filesystem': efsResource,
    '@octo/internet-gateway=igw-region': igwResource,
    '@octo/vpc=vpc-region': vpcResource,
  } = await testModuleContainer.createTestResources<[EfsSchema, InternetGatewaySchema, VpcSchema]>(
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

  const efsOctoResource = octoTerraform.addOctoTerraformResource(efsResource);
  efsOctoResource.output({
    FileSystemId: octoTerraform.raw('mock.FileSystemId'),
  });
  const igwOctoResource = octoTerraform.addOctoTerraformResource(igwResource);
  igwOctoResource.output({
    InternetGatewayId: octoTerraform.raw('mock.InternetGatewayId'),
  });
  const vpcOctoResource = octoTerraform.addOctoTerraformResource(vpcResource);
  vpcOctoResource.output({
    VpcId: octoTerraform.raw('mock.VpcId'),
  });

  return { account, app, filesystem, region };
}

describe('AwsSimpleSubnetModule UT', () => {
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );
    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer, octoTerraform);
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
         "CaptureSubnetResponseResourceAction",
         "CaptureSecurityGroupResponseResourceAction",
       ],
       [
         "CaptureRouteTableResponseResourceAction",
         "CaptureNetworkAclResponseResourceAction",
         "CaptureEfsMountTargetResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
       "+ @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "+ @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
     ]
    `);
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     output "efs-region-test-filesystem-FileSystemId" {
       value = mock.FileSystemId
     }

     output "igw-region-InternetGatewayId" {
       value = mock.InternetGatewayId
     }

     output "vpc-region-VpcId" {
       value = mock.VpcId
     }

     resource "aws_subnet" "subnet-region-private-subnet" {
       provider = aws.123-us-east-1
       availability_zone = "us-east-1a"
       cidr_block = "10.0.1.0/24"
       vpc_id = mock.VpcId
     }

     output "subnet-region-private-subnet-SubnetArn" {
       value = aws_subnet.subnet-region-private-subnet.arn
     }

     output "subnet-region-private-subnet-SubnetId" {
       value = aws_subnet.subnet-region-private-subnet.id
     }

     resource "aws_route_table" "rt-region-private-subnet" {
       provider = aws.123-us-east-1
       vpc_id = mock.VpcId
     }

     resource "aws_route_table_association" "rt-region-private-subnet_assoc" {
       provider = aws.123-us-east-1
       route_table_id = aws_route_table.rt-region-private-subnet.id
       subnet_id = aws_subnet.subnet-region-private-subnet.id

       depends_on = [aws_route_table.rt-region-private-subnet]
     }

     output "rt-region-private-subnet-RouteTableId" {
       value = aws_route_table.rt-region-private-subnet.id
     }

     output "rt-region-private-subnet-subnetAssociationId" {
       value = aws_route_table_association.rt-region-private-subnet_assoc.id
     }

     resource "aws_network_acl" "nacl-region-private-subnet" {
       provider = aws.123-us-east-1
       subnet_ids = [aws_subnet.subnet-region-private-subnet.id]
       vpc_id = mock.VpcId
       ingress {
         action = "allow"
         cidr_block = "10.0.1.0/24"
         from_port = -1
         protocol = "-1"
         rule_no = 10
         to_port = -1
       }
       egress {
         action = "allow"
         cidr_block = "10.0.1.0/24"
         from_port = -1
         protocol = "-1"
         rule_no = 10
         to_port = -1
       }
     }

     output "nacl-region-private-subnet-NetworkAclId" {
       value = aws_network_acl.nacl-region-private-subnet.id
     }

     resource "aws_security_group" "sec-grp-efs-mount-region-private-subnet-test-filesystem" {
       provider = aws.123-us-east-1
       vpc_id = mock.VpcId
     }

     resource "aws_vpc_security_group_ingress_rule" "sec-grp-efs-mount-region-private-subnet-test-filesystem_ingress_0" {
       provider = aws.123-us-east-1
       cidr_ipv4 = "10.0.1.0/24"
       description = "tcp 2049-2049 10.0.1.0/24"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id
       from_port = 2049
       to_port = 2049

       depends_on = [aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem]
     }

     output "sec-grp-efs-mount-region-private-subnet-test-filesystem-Arn" {
       value = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.arn
     }

     output "sec-grp-efs-mount-region-private-subnet-test-filesystem-GroupId" {
       value = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id
     }

     resource "aws_efs_mount_target" "efs-mount-region-private-subnet-test-filesystem" {
       provider = aws.123-us-east-1
       file_system_id = mock.FileSystemId
       security_groups = [aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id]
       subnet_id = aws_subnet.subnet-region-private-subnet.id
     }

     output "efs-mount-region-private-subnet-test-filesystem-MountTargetId" {
       value = aws_efs_mount_target.efs-mount-region-private-subnet-test-filesystem.id
     }

     output "efs-mount-region-private-subnet-test-filesystem-NetworkInterfaceId" {
       value = aws_efs_mount_target.efs-mount-region-private-subnet-test-filesystem.network_interface_id
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appAddSubnetOptions } = await setup(testModuleContainer, octoTerraform);
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
    const resultAddSubnetOptions = await testModuleContainer.commit(appAddSubnetOptions, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultAddSubnetOptions.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appAddLocalFilesystem } = await setup(testModuleContainer, octoTerraform);
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
    const resultAddLocalFilesystem = await testModuleContainer.commit(appAddLocalFilesystem, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultAddLocalFilesystem.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "+ @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer, octoTerraform);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "- @octo/subnet=subnet-region-private-subnet",
       "- @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
       "- @octo/network-acl=nacl-region-private-subnet",
       "- @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should associate and disassociate subnet with siblings', async () => {
    const { app: appAssociateSubnet } = await setup(testModuleContainer, octoTerraform);
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
    const resultAssociateSubnet = await testModuleContainer.commit(appAssociateSubnet, { enableResourceCapture: true });
    expect(new DiffAssert(resultAssociateSubnet.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
       "+ @octo/subnet=subnet-region-public-subnet",
       "+ @octo/route-table=rt-region-public-subnet",
       "+ @octo/network-acl=nacl-region-public-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDisassociateSubnet } = await setup(testModuleContainer, octoTerraform);
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

    const resultDisassociateSubnet = await testModuleContainer.commit(appDisassociateSubnet, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultDisassociateSubnet.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/network-acl=nacl-region-public-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  it('should associate and disassociate private subnet with public subnet with a NAT Gateway', async () => {
    const { app: appAssociateSubnet } = await setup(testModuleContainer, octoTerraform);
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

    const resultAssociateSubnet = await testModuleContainer.commit(appAssociateSubnet, { enableResourceCapture: true });
    expect(new DiffAssert(resultAssociateSubnet.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-public-subnet",
       "+ @octo/nat-gateway=nat-gateway-region-public-subnet",
       "+ @octo/route-table=rt-region-public-subnet",
       "+ @octo/network-acl=nacl-region-public-subnet",
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDisassociateSubnet } = await setup(testModuleContainer, octoTerraform);
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
    const resultDisassociateSubnet = await testModuleContainer.commit(appDisassociateSubnet, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultDisassociateSubnet.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/network-acl=nacl-region-public-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteNATGateway } = await setup(testModuleContainer, octoTerraform);
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
    const resultDeleteNATGateway = await testModuleContainer.commit(appDeleteNATGateway, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultDeleteNATGateway.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/nat-gateway=nat-gateway-region-public-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer, octoTerraform);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/subnet=subnet-region-private-subnet",
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer, octoTerraform);
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
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/subnet=subnet-region-private-subnet",
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle subnetAvailabilityZone change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateAvailabilityZone } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsSimpleSubnetModule>({
        inputs: {
          region: stub('${{testModule.model.region}}'),
          subnetAvailabilityZone: 'us-east-1b',
          subnetCidrBlock: '10.0.1.0/24',
          subnetName: 'private-subnet',
        },
        moduleId: 'subnet',
        type: AwsSimpleSubnetModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateAvailabilityZone, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update Subnet immutable properties once it has been created!"`,
      );
    });

    it('should handle subnetCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateCidrBlock } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsSimpleSubnetModule>({
        inputs: {
          region: stub('${{testModule.model.region}}'),
          subnetAvailabilityZone: 'us-east-1a',
          subnetCidrBlock: '10.0.2.0/24',
          subnetName: 'private-subnet',
        },
        moduleId: 'subnet',
        type: AwsSimpleSubnetModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateCidrBlock, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update Subnet immutable properties once it has been created!"`,
      );
    });

    it('should handle subnetName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateSubnetName } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsSimpleSubnetModule>({
        inputs: {
          region: stub('${{testModule.model.region}}'),
          subnetAvailabilityZone: 'us-east-1a',
          subnetCidrBlock: '10.0.1.0/24',
          subnetName: 'changed-subnet',
        },
        moduleId: 'subnet',
        type: AwsSimpleSubnetModule,
      });
      const resultUpdateSubnetName = await testModuleContainer.commit(appUpdateSubnetName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateSubnetName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "- @octo/subnet=subnet-region-private-subnet",
         "- @octo/network-acl=nacl-region-private-subnet",
         "- @octo/route-table=rt-region-private-subnet",
         "+ @octo/subnet=subnet-region-changed-subnet",
         "+ @octo/route-table=rt-region-changed-subnet",
         "+ @octo/network-acl=nacl-region-changed-subnet",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle subnetOptions change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateSubnetOptions } = await setup(testModuleContainer, octoTerraform);
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
      const resultUpdateSubnetOptions = await testModuleContainer.commit(appUpdateSubnetOptions, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateSubnetOptions.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/network-acl=nacl-region-private-subnet",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet-1',
      type: AwsSimpleSubnetModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet-2',
      type: AwsSimpleSubnetModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('validation', () => {
    it('should validate invalid subnet availability zone', async () => {
      await setup(testModuleContainer, octoTerraform);
      await expect(async () => {
        await testModuleContainer.runModule<AwsSimpleSubnetModule>({
          inputs: {
            region: stub('${{testModule.model.region}}'),
            subnetAvailabilityZone: 'us-west-2a',
            subnetCidrBlock: '10.0.1.0/24',
            subnetName: 'private-subnet',
          },
          moduleId: 'subnet',
          type: AwsSimpleSubnetModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid subnet availability zone!"`);
    });

    it('should validate NAT Gateway only for public subnets', async () => {
      await setup(testModuleContainer, octoTerraform);
      await expect(async () => {
        await testModuleContainer.runModule<AwsSimpleSubnetModule>({
          inputs: {
            region: stub('${{testModule.model.region}}'),
            subnetAvailabilityZone: 'us-east-1a',
            subnetCidrBlock: '10.0.1.0/24',
            subnetName: 'private-subnet',
            subnetOptions: {
              createNatGateway: true,
              disableSubnetIntraNetwork: false,
              subnetType: SubnetType.PRIVATE,
            },
          },
          moduleId: 'subnet',
          type: AwsSimpleSubnetModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"NAT Gateway can only be created for public subnets!"`);
    });

    it('should validate subnet CIDR within region CIDR', async () => {
      await setup(testModuleContainer, octoTerraform);
      await expect(async () => {
        await testModuleContainer.runModule<AwsSimpleSubnetModule>({
          inputs: {
            region: stub('${{testModule.model.region}}'),
            subnetAvailabilityZone: 'us-east-1a',
            subnetCidrBlock: '192.168.1.0/24',
            subnetName: 'private-subnet',
          },
          moduleId: 'subnet',
          type: AwsSimpleSubnetModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Subnet CIDR is not within region CIDR!"`);
    });
  });
});
