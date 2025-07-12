import { AModule, type Account, Module, type Subnet, SubnetType } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import { SubnetLocalFilesystemMountAnchor } from '../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.js';
import { AwsSubnetModuleSchema } from './index.schema.js';
import { AwsSubnet } from './models/subnet/index.js';
import { AwsSubnetLocalFilesystemMountOverlay } from './overlays/subnet-local-filesystem-mount/index.js';

/**
 * `AwsSubnetModule` is a simple AWS subnet module that provides an implementation for the `Subnet` model.
 * This module creates VPC subnets with configurable network settings, NAT gateway support,
 * and filesystem mounting capabilities.
 * It manages network isolation and connectivity for containerized applications within AWS regions.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsSubnetModule } from '@quadnix/octo-aws-cdk/modules/subnet/simple-aws-subnet';
 *
 * octo.loadModule(AwsSubnetModule, 'my-subnet-module', {
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
 *     subnetCidrBlock: '10.0.0.0/24',
 *     subnetName: 'public-subnet-1',
 *   }],
 * });
 * ```
 *
 * @group Modules/Subnet/SimpleAwsSubnet
 *
 * @reference Resources {@link EfsMountTargetSchema}
 * @reference Resources {@link NatGatewaySchema}
 * @reference Resources {@link NetworkAclSchema}
 * @reference Resources {@link RouteTableSchema}
 * @reference Resources {@link SecurityGroupSchema}
 * @reference Resources {@link SubnetSchema}
 *
 * @see {@link AwsSubnetModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Subnet} to learn more about the `Subnet` model.
 */
@Module<AwsSubnetModule>('@octo', AwsSubnetModuleSchema)
export class AwsSubnetModule extends AModule<AwsSubnetModuleSchema, AwsSubnet> {
  async onInit(inputs: AwsSubnetModuleSchema): Promise<(AwsSubnet | AwsSubnetLocalFilesystemMountOverlay)[]> {
    const region = inputs.region;
    const { awsAccountId, awsAvailabilityZones, awsRegionId } = await this.registerMetadata(inputs);

    // Validate subnet availability zone.
    if (!awsAvailabilityZones.includes(inputs.subnetAvailabilityZone)) {
      throw new Error('Invalid subnet availability zone!');
    }

    // Validate NAT Gateway option.
    if (inputs.subnetOptions?.createNatGateway && inputs.subnetOptions.subnetType !== SubnetType.PUBLIC) {
      throw new Error('NAT Gateway can only be created for public subnets!');
    }

    // Create a new subnet.
    const subnet = new AwsSubnet(region, inputs.subnetName);
    subnet.createNatGateway = inputs.subnetOptions?.createNatGateway || false;
    subnet.disableSubnetIntraNetwork = inputs.subnetOptions?.disableSubnetIntraNetwork || false;
    subnet.subnetType = inputs.subnetOptions?.subnetType || SubnetType.PRIVATE;
    region.addSubnet(subnet);

    const models: (AwsSubnet | AwsSubnetLocalFilesystemMountOverlay)[] = [subnet];

    // Associate subnet with siblings.
    const regionSubnets = (region.getChildren('subnet')['subnet'] || []).map((d) => d.to as Subnet);
    for (const { subnetName } of inputs.subnetSiblings || []) {
      const siblingSubnet = regionSubnets.find((s) => s.subnetName === subnetName);
      if (!siblingSubnet) {
        throw new Error(`Sibling subnet "${subnetName}" not found!`);
      }
      subnet.updateNetworkingRules(siblingSubnet, true);
    }

    for (const filesystem of inputs.localFilesystems || []) {
      const [matchingEfsFilesystemAnchor] = await filesystem.getAnchorsMatchingSchema(EfsFilesystemAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (!matchingEfsFilesystemAnchor) {
        throw new Error(`Filesystem "${filesystem.filesystemName}" not found in "${awsRegionId}"!`);
      }

      // Add anchors.
      const subnetLocalFilesystemMountAnchor = new SubnetLocalFilesystemMountAnchor(
        `SubnetLocalFilesystemMountAnchor-${filesystem.filesystemName}`,
        { awsAccountId, awsRegionId, filesystemName: filesystem.filesystemName, subnetName: inputs.subnetName },
        subnet,
      );
      subnet.addAnchor(subnetLocalFilesystemMountAnchor);

      const subnetLocalFilesystemMountOverlay = new AwsSubnetLocalFilesystemMountOverlay(
        `subnet-local-filesystem-mount-overlay-${subnet.subnetName}-${filesystem.filesystemName}`,
        {
          filesystemName: filesystem.filesystemName,
          regionId: region.regionId,
          subnetId: subnet.subnetId,
          subnetName: subnet.subnetName,
        },
        [matchingEfsFilesystemAnchor, subnetLocalFilesystemMountAnchor],
      );
      models.push(subnetLocalFilesystemMountOverlay);
    }

    return models;
  }

  override async registerMetadata(
    inputs: AwsSubnetModuleSchema,
  ): Promise<{ awsAccountId: string; awsAvailabilityZones: string[]; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsRegionAZs, awsRegionId } = matchingAnchor.getSchemaInstance().properties;

    return {
      awsAccountId: account.accountId,
      awsAvailabilityZones: awsRegionAZs,
      awsRegionId,
    };
  }
}
