import {
  type Account,
  type App,
  type Filesystem,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { EfsSchema } from '../../../resources/efs/index.schema.js';
import type { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
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

  await testModuleContainer.createTestResources<[EfsSchema, InternetGatewaySchema, VpcSchema]>(
    'testModule',
    [
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
        terraform: true,
      },
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', internetGatewayName: 'default' },
        resourceContext: '@octo/internet-gateway=igw-region',
        response: { InternetGatewayId: 'InternetGatewayId' },
        terraform: true,
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
        terraform: true,
      },
    ],
    { save: true },
  );

  return { account, app, filesystem, region };
}

describe('AwsSimpleSubnetModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
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
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
     "# subnet/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_subnet" "subnet-region-private-subnet" {
       provider = aws._123-us-east-1
       availability_zone = "us-east-1a"
       cidr_block = "10.0.1.0/24"
       vpc_id = var.vpc_region_VpcId
     }

     resource "aws_route_table" "rt-region-private-subnet" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region_VpcId
     }

     resource "aws_route_table_association" "rt-region-private-subnet_assoc" {
       provider = aws._123-us-east-1
       route_table_id = aws_route_table.rt-region-private-subnet.id
       subnet_id = aws_subnet.subnet-region-private-subnet.id

       depends_on = [aws_route_table.rt-region-private-subnet]
     }

     resource "aws_network_acl" "nacl-region-private-subnet" {
       provider = aws._123-us-east-1
       subnet_ids = [aws_subnet.subnet-region-private-subnet.id]
       vpc_id = var.vpc_region_VpcId
       ingress {
         action = "allow"
         cidr_block = "10.0.1.0/24"
         from_port = 0
         protocol = "-1"
         rule_no = 10
         to_port = 0
       }
       egress {
         action = "allow"
         cidr_block = "10.0.1.0/24"
         from_port = 0
         protocol = "-1"
         rule_no = 10
         to_port = 0
       }
     }

     resource "aws_security_group" "sec-grp-efs-mount-region-private-subnet-test-filesystem" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region_VpcId
     }

     resource "aws_vpc_security_group_ingress_rule" "sec-grp-efs-mount-region-private-subnet-test-filesystem_ingress_0" {
       provider = aws._123-us-east-1
       cidr_ipv4 = "10.0.1.0/24"
       description = "tcp 2049-2049 10.0.1.0/24"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id
       from_port = 2049
       to_port = 2049

       depends_on = [aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem]
     }

     resource "aws_efs_mount_target" "efs-mount-region-private-subnet-test-filesystem" {
       provider = aws._123-us-east-1
       file_system_id = var.efs_region_test_filesystem_FileSystemId
       security_groups = [aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id]
       subnet_id = aws_subnet.subnet-region-private-subnet.id
     }

     # subnet/outputs.tf
     output "subnet-region-private-subnet-SubnetArn" {
       value = aws_subnet.subnet-region-private-subnet.arn
     }

     output "subnet-region-private-subnet-SubnetId" {
       value = aws_subnet.subnet-region-private-subnet.id
     }

     output "rt-region-private-subnet-RouteTableId" {
       value = aws_route_table.rt-region-private-subnet.id
     }

     output "rt-region-private-subnet-subnetAssociationId" {
       value = aws_route_table_association.rt-region-private-subnet_assoc.id
     }

     output "nacl-region-private-subnet-NetworkAclId" {
       value = aws_network_acl.nacl-region-private-subnet.id
     }

     output "sec-grp-efs-mount-region-private-subnet-test-filesystem-Arn" {
       value = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.arn
     }

     output "sec-grp-efs-mount-region-private-subnet-test-filesystem-GroupId" {
       value = aws_security_group.sec-grp-efs-mount-region-private-subnet-test-filesystem.id
     }

     output "efs-mount-region-private-subnet-test-filesystem-MountTargetId" {
       value = aws_efs_mount_target.efs-mount-region-private-subnet-test-filesystem.id
     }

     output "efs-mount-region-private-subnet-test-filesystem-NetworkInterfaceId" {
       value = aws_efs_mount_target.efs-mount-region-private-subnet-test-filesystem.network_interface_id
     }

     # subnet/terragrunt.hcl
     dependency "testModule" {
       config_path = "../testModule"

       mock_outputs = {
         "efs-region-test-filesystem-FileSystemId" = "mock-efs-region-test-filesystem-FileSystemId"
         "vpc-region-VpcId" = "mock-vpc-region-VpcId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "validate"]
     }

     inputs = {
       efs_region_test_filesystem_FileSystemId = dependency.testModule.outputs["efs-region-test-filesystem-FileSystemId"]
       vpc_region_VpcId = dependency.testModule.outputs["vpc-region-VpcId"]
     }

     # subnet/variables.tf
     variable "efs_region_test_filesystem_FileSystemId" {}

     variable "vpc_region_VpcId" {}

     # testModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # testModule/outputs.tf
     output "efs-region-test-filesystem-FileSystemArn" {
       value = "FileSystemArn"
     }

     output "efs-region-test-filesystem-FileSystemId" {
       value = "FileSystemId"
     }

     output "igw-region-InternetGatewayId" {
       value = "InternetGatewayId"
     }

     output "vpc-region-VpcId" {
       value = "VpcId"
     }

     # testModule/terragrunt.hcl
     <empty>

     # testModule/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['subnet'] });
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
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/subnet=subnet-region-private-subnet",
       "+ @octo/route-table=rt-region-private-subnet",
       "+ @octo/network-acl=nacl-region-private-subnet",
       "+ @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "+ @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
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
    await testModuleContainer.commit(appCreate);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appAddSubnetOptions } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appAddSubnetOptions)).toMatchSnapshot();
    const resultAddSubnetOptions = await testModuleContainer.commit(appAddSubnetOptions);
    expect(testModuleContainer.digestDiffs(resultAddSubnetOptions.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appAddLocalFilesystem } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appAddLocalFilesystem)).toMatchSnapshot();
    const resultAddLocalFilesystem = await testModuleContainer.commit(appAddLocalFilesystem);
    expect(testModuleContainer.digestDiffs(resultAddLocalFilesystem.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "+ @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/security-group=sec-grp-efs-mount-region-private-subnet-test-filesystem",
       "- @octo/subnet=subnet-region-private-subnet",
       "- @octo/efs-mount-target=efs-mount-region-private-subnet-test-filesystem",
       "- @octo/network-acl=nacl-region-private-subnet",
       "- @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should associate and disassociate subnet with siblings', async () => {
    const { app: appAssociateSubnet } = await setup(testModuleContainer);
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
    await testModuleContainer.commit(appAssociateSubnet);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDisassociateSubnet } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appDisassociateSubnet)).toMatchSnapshot();
    const resultDisassociateSubnet = await testModuleContainer.commit(appDisassociateSubnet);
    expect(testModuleContainer.digestDiffs(resultDisassociateSubnet.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/network-acl=nacl-region-public-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should associate and disassociate private subnet with public subnet with a NAT Gateway', async () => {
    const { app: appAssociateSubnet } = await setup(testModuleContainer);
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

    await testModuleContainer.commit(appAssociateSubnet);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDisassociateSubnet } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appDisassociateSubnet)).toMatchSnapshot();
    const resultDisassociateSubnet = await testModuleContainer.commit(appDisassociateSubnet);
    expect(testModuleContainer.digestDiffs(resultDisassociateSubnet.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/network-acl=nacl-region-public-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDeleteNATGateway } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appDeleteNATGateway)).toMatchSnapshot();
    const resultDeleteNATGateway = await testModuleContainer.commit(appDeleteNATGateway);
    expect(testModuleContainer.digestDiffs(resultDeleteNATGateway.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/nat-gateway=nat-gateway-region-public-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
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
    await testModuleContainer.commit(appCreate);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/subnet=subnet-region-private-subnet",
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDeleteTags } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/subnet=subnet-region-private-subnet",
       "* @octo/network-acl=nacl-region-private-subnet",
       "* @octo/route-table=rt-region-private-subnet",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  describe('input changes', () => {
    it('should handle subnetAvailabilityZone change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdateAvailabilityZone } = await setup(testModuleContainer);
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
      // availability_zone is force-new on aws_subnet → octo emits a REPLACE on the subnet.
      const resultUpdateAvailabilityZone = await testModuleContainer.commit(appUpdateAvailabilityZone);
      expect(testModuleContainer.digestDiffs(resultUpdateAvailabilityZone.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/subnet=subnet-region-private-subnet",
         "* @octo/network-acl=nacl-region-private-subnet",
         "* @octo/route-table=rt-region-private-subnet",
       ]
      `);
    });

    it('should handle subnetCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdateCidrBlock } = await setup(testModuleContainer);
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
      // cidr_block is force-new on aws_subnet → octo emits a REPLACE on the subnet.
      const resultUpdateCidrBlock = await testModuleContainer.commit(appUpdateCidrBlock);
      expect(testModuleContainer.digestDiffs(resultUpdateCidrBlock.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/subnet=subnet-region-private-subnet",
         "* @octo/network-acl=nacl-region-private-subnet",
         "* @octo/network-acl=nacl-region-private-subnet",
         "* @octo/route-table=rt-region-private-subnet",
       ]
      `);
    });

    it('should handle subnetName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdateSubnetName } = await setup(testModuleContainer);
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
      expect(await testModuleContainer.diffHcl(appUpdateSubnetName)).toMatchSnapshot();
      const resultUpdateSubnetName = await testModuleContainer.commit(appUpdateSubnetName);
      expect(testModuleContainer.digestDiffs(resultUpdateSubnetName.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/subnet=subnet-region-private-subnet",
         "- @octo/network-acl=nacl-region-private-subnet",
         "- @octo/route-table=rt-region-private-subnet",
         "+ @octo/subnet=subnet-region-changed-subnet",
         "+ @octo/route-table=rt-region-changed-subnet",
         "+ @octo/network-acl=nacl-region-changed-subnet",
       ]
      `);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
    });

    it('should handle subnetOptions change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdateSubnetOptions } = await setup(testModuleContainer);
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
      expect(await testModuleContainer.diffHcl(appUpdateSubnetOptions)).toMatchSnapshot();
      const resultUpdateSubnetOptions = await testModuleContainer.commit(appUpdateSubnetOptions);
      expect(testModuleContainer.digestDiffs(resultUpdateSubnetOptions.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/network-acl=nacl-region-private-subnet",
       ]
      `);
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
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
    await testModuleContainer.commit(appCreate);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  describe('validation', () => {
    it('should validate invalid subnet availability zone', async () => {
      await setup(testModuleContainer);
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
      await setup(testModuleContainer);
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
      await setup(testModuleContainer);
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

    it('should normalize the all-ports sentinel (-1) to 0 in rendered HCL', async () => {
      const { app } = await setup(testModuleContainer);
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

      const hcl = await testModuleContainer.renderHcl(app);
      expect(hcl).toContain('from_port = 0');
      expect(hcl).toContain('to_port = 0');
      expect(hcl).not.toContain('from_port = -1');
      expect(hcl).not.toContain('to_port = -1');
    });
  });
});
