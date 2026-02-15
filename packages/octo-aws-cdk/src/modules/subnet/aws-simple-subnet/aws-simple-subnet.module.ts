import { AModule, type Account, type Filesystem, Module, ModuleError, type Region, SubnetType } from '@quadnix/octo';
import { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountAnchor } from '../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.js';
import { AwsSubnetAnchor } from '../../../anchors/aws-subnet/aws-subnet.anchor.js';
import { CidrUtility } from '../../../utilities/cidr/cidr.utility.js';
import { AwsSimpleSubnetModuleSchema } from './index.schema.js';
import { AwsSimpleSubnet } from './models/subnet/index.js';
import { AwsSimpleSubnetLocalFilesystemMountOverlay } from './overlays/aws-simple-subnet-local-filesystem-mount/index.js';

/**
 * `AwsSimpleSubnetModule` is a simple AWS subnet module that provides an implementation for the `Subnet` model.
 * This module creates VPC subnets with configurable network settings, NAT gateway support,
 * and filesystem mounting capabilities.
 * It manages network isolation and connectivity for containerized applications within AWS regions.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsSimpleSubnetModule } from '@quadnix/octo-aws-cdk/modules/subnet/aws-simple-subnet';
 *
 * octo.loadModule(AwsSimpleSubnetModule, 'my-subnet-module', {
 *   localFilesystems: [myEfsFilesystem],
 *   region: myRegion,
 *   subnetAvailabilityZone: 'us-east-1a',
 *   subnetCidrBlock: '10.0.1.0/24',
 *   subnetName: 'private-subnet-1',
 *   subnetOptions: {
 *     createNatGateway: false,
 *     disableSubnetIntraNetwork: false,
 *     subnetType: SubnetType.PRIVATE,
 *   },
 *   subnetSiblings: [{
 *     attachToNatGateway: true,
 *     subnet: mySiblingSubnet,
 *   }],
 * });
 * ```
 *
 * @group Modules/Subnet/AwsSimpleSubnet
 *
 * @reference Resources {@link EfsMountTargetSchema}
 * @reference Resources {@link NatGatewaySchema}
 * @reference Resources {@link NetworkAclSchema}
 * @reference Resources {@link RouteTableSchema}
 * @reference Resources {@link SecurityGroupSchema}
 * @reference Resources {@link SubnetSchema}
 *
 * @see {@link AwsSimpleSubnetModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Subnet} to learn more about the `Subnet` model.
 */
@Module<AwsSimpleSubnetModule>('@octo', AwsSimpleSubnetModuleSchema)
export class AwsSimpleSubnetModule extends AModule<AwsSimpleSubnetModuleSchema, AwsSimpleSubnet> {
  async onInit(
    inputs: AwsSimpleSubnetModuleSchema,
  ): Promise<(AwsSimpleSubnet | AwsSimpleSubnetLocalFilesystemMountOverlay)[]> {
    const region = inputs.region;
    const { awsAccountId, awsAvailabilityZones, awsRegionId, awsRegionVpcCidrBlock } =
      await this.registerMetadata(inputs);

    // Validate subnet availability zone.
    if (!awsAvailabilityZones.includes(inputs.subnetAvailabilityZone)) {
      throw new ModuleError('Invalid subnet availability zone!', this.constructor.name);
    }

    // Validate NAT Gateway option.
    if (inputs.subnetOptions?.createNatGateway && inputs.subnetOptions.subnetType !== SubnetType.PUBLIC) {
      throw new ModuleError('NAT Gateway can only be created for public subnets!', this.constructor.name);
    }

    // Validate subnet CIDR is within region CIDR.
    if (!CidrUtility.contains([awsRegionVpcCidrBlock], [inputs.subnetCidrBlock])) {
      throw new ModuleError('Subnet CIDR is not within region CIDR!', this.constructor.name);
    }

    // Create a new subnet.
    const subnet = new AwsSimpleSubnet(region, inputs.subnetName);
    subnet.createNatGateway = inputs.subnetOptions?.createNatGateway || false;
    subnet.disableSubnetIntraNetwork = inputs.subnetOptions?.disableSubnetIntraNetwork || false;
    subnet.subnetType = inputs.subnetOptions?.subnetType || SubnetType.PRIVATE;
    region.addSubnet(subnet);

    // Add anchors.
    const awsSubnetAnchor = new AwsSubnetAnchor(
      'AwsSubnetAnchor',
      {
        AvailabilityZone: inputs.subnetAvailabilityZone,
        awsAccountId,
        awsRegionId,
        CidrBlock: inputs.subnetCidrBlock,
        subnetName: subnet.subnetName,
      },
      subnet,
    );
    subnet.addAnchor(awsSubnetAnchor);

    const models: (AwsSimpleSubnet | AwsSimpleSubnetLocalFilesystemMountOverlay)[] = [subnet];

    // Associate subnet with siblings.
    for (const { subnet: siblingSubnet } of inputs.subnetSiblings || []) {
      if ((siblingSubnet.getParents()['region'][0].to as Region).regionId !== region.regionId) {
        throw new ModuleError(
          `Sibling subnet "${siblingSubnet.subnetName}" not found within the same region!`,
          this.constructor.name,
        );
      }
      subnet.updateNetworkingRules(siblingSubnet, true);
    }

    for (const filesystem of inputs.localFilesystems || []) {
      const [matchingAwsEfsAnchor] = await filesystem.getAnchorsMatchingSchema(AwsEfsAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (
        !matchingAwsEfsAnchor ||
        ((matchingAwsEfsAnchor.getActual().getParent() as Filesystem).getParents()['region'][0].to as Region)
          .regionId !== region.regionId
      ) {
        throw new ModuleError(
          `Filesystem "${filesystem.filesystemName}" not found within the same region!`,
          this.constructor.name,
        );
      }

      const awsSimpleSubnetLocalFilesystemMountOverlay = new AwsSimpleSubnetLocalFilesystemMountOverlay(
        `aws-simple-subnet-local-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
        {
          filesystemName: filesystem.filesystemName,
          regionId: region.regionId,
          subnetId: subnet.subnetId,
          subnetName: subnet.subnetName,
        },
        [matchingAwsEfsAnchor, awsSubnetAnchor],
      );
      subnet.addAnchor(
        new AwsSubnetLocalFilesystemMountAnchor(
          `AwsSubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
          { awsAccountId, awsRegionId, filesystemName: filesystem.filesystemName, subnetName: inputs.subnetName },
          awsSimpleSubnetLocalFilesystemMountOverlay,
        ),
      );
      models.push(awsSimpleSubnetLocalFilesystemMountOverlay);
    }

    return models;
  }

  override async registerMetadata(inputs: AwsSimpleSubnetModuleSchema): Promise<{
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    awsRegionVpcCidrBlock: string;
  }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsRegionAZs, awsRegionId, vpcCidrBlock } = matchingAnchor.getSchemaInstance().properties;

    return {
      awsAccountId: account.accountId,
      awsAvailabilityZones: awsRegionAZs,
      awsRegionId,
      awsRegionVpcCidrBlock: vpcCidrBlock,
    };
  }
}
