import {
  type Filesystem,
  FilesystemSchema,
  type Region,
  RegionSchema,
  Schema,
  SubnetType,
  Validate,
} from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import { AwsSubnetLocalFilesystemMountSchema } from './overlays/subnet-local-filesystem-mount/aws-subnet-local-filesystem-mount.schema.js';

export { AwsSubnetLocalFilesystemMountSchema };

/**
 * `AwsSubnetModuleSchema` is the input schema for the `AwsSubnetModule` module.
 * This schema defines the configuration for AWS subnets including networking settings,
 * availability zone placement, sibling relationships, and filesystem mounting.
 *
 * @group Modules/Subnet/SimpleAwsSubnet
 *
 * @hideconstructor
 *
 * @see {@link AwsSubnetModule} to learn more about the `AwsSubnetModule` module.
 */
export class AwsSubnetModuleSchema {
  /**
   * Optional array of EFS filesystems to mount in this subnet.
   * These filesystems provide shared persistent storage accessible from containers running in the subnet.
   */
  @Validate({
    destruct: (value: AwsSubnetModuleSchema['localFilesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [{ schema: EfsFilesystemAnchorSchema }], NODE_NAME: 'filesystem' },
      isSchema: { schema: FilesystemSchema },
    },
  })
  localFilesystems? = Schema<Filesystem[]>([]);

  /**
   * The AWS region where this subnet will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  /**
   * The availability zone where the subnet will be created.
   * Must be a valid availability zone within the specified region.
   */
  @Validate({ options: { minLength: 1 } })
  subnetAvailabilityZone = Schema<string>();

  /**
   * The CIDR block for the subnet.
   * This defines the IP address range for the subnet and must be within the VPC CIDR block.
   */
  @Validate({ options: { minLength: 1 } })
  subnetCidrBlock = Schema<string>();

  /**
   * The name of the subnet.
   * This is used to identify the subnet within the region.
   */
  @Validate({ options: { minLength: 1 } })
  subnetName = Schema<string>();

  /**
   * Optional subnet configuration options.
   * These options control subnet behavior including NAT gateway creation and network isolation.
   * * `subnetOptions.createNatGateway` - Whether to create a NAT gateway in the subnet.
   * * `subnetOptions.disableSubnetIntraNetwork` - Whether to disable intra-network traffic within the subnet.
   * With intra-network traffic disabled, traffic within the subnet will not be able to communicate with each other.
   * They must go out of the subnet to communicate with each other. This can be useful in a private subnet where
   * access between containers should be managed via a load balancer.
   * * `subnetOptions.subnetType` - The type of subnet to create. See {@link SubnetType} for options.
   */
  @Validate({
    destruct: (value: AwsSubnetModuleSchema['subnetOptions']): string[] => [
      String(value!.createNatGateway),
      String(value!.disableSubnetIntraNetwork),
      value!.subnetType,
    ],
    options: { minLength: 1 },
  })
  subnetOptions? = Schema<{ createNatGateway: boolean; disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>({
    createNatGateway: false,
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  });

  /**
   * Optional array of sibling subnets to establish network relationships with.
   * Sibling subnets allow NAcl rules to allow traffic between the two subnets.
   */
  @Validate({
    destruct: (value: AwsSubnetModuleSchema['subnetSiblings']): string[] =>
      value!.map((v) => [String(v.attachToNatGateway), v.subnetCidrBlock, v.subnetName]).flat(),
    options: { minLength: 1 },
  })
  subnetSiblings? = Schema<{ attachToNatGateway: boolean; subnetCidrBlock: string; subnetName: string }[]>([]);
}
