import {
  type Filesystem,
  FilesystemSchema,
  type Region,
  RegionSchema,
  Schema,
  type Subnet,
  SubnetSchema,
  SubnetType,
  Validate,
} from '@quadnix/octo';
import { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-subnet.anchor.schema.js';
import { AwsSimpleSubnetLocalFilesystemMountOverlaySchema } from './overlays/aws-simple-subnet-local-filesystem-mount/aws-simple-subnet-local-filesystem-mount.schema.js';

export { AwsSimpleSubnetLocalFilesystemMountOverlaySchema };

/**
 * `AwsSimpleSubnetModuleSchema` is the input schema for the `AwsSimpleSubnetModule` module.
 * This schema defines the configuration for AWS subnets including networking settings,
 * availability zone placement, sibling relationships, nat gateway, and filesystem mounting.
 *
 * @group Modules/Subnet/AwsSimpleSubnet
 *
 * @hideconstructor
 *
 * @see {@link AwsSimpleSubnetModule} to learn more about the `AwsSimpleSubnetModule` module.
 */
export class AwsSimpleSubnetModuleSchema {
  /**
   * Optional array of EFS filesystems to mount in this subnet.
   * These filesystems provide shared persistent storage accessible from containers running in the subnet.
   */
  @Validate({
    destruct: (value: AwsSimpleSubnetModuleSchema['localFilesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [{ schema: AwsEfsAnchorSchema }], NODE_NAME: 'filesystem' },
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
    destruct: (value: AwsSimpleSubnetModuleSchema['subnetOptions']): string[] => [
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
  @Validate<unknown>([
    {
      destruct: (value: AwsSimpleSubnetModuleSchema['subnetSiblings']): string[] =>
        value!.map((v) => String(v.attachToNatGateway)),
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsSimpleSubnetModuleSchema['subnetSiblings']): Subnet[] => value!.map((v) => v.subnet),
      options: {
        isModel: { anchors: [{ schema: AwsSubnetAnchorSchema }], NODE_NAME: 'subnet' },
      },
    },
    {
      destruct: (value: AwsSimpleSubnetModuleSchema['subnetSiblings']): SubnetSchema[] =>
        value!.map((v) => v.subnet.synth()),
      options: {
        isSchema: { schema: SubnetSchema },
      },
    },
  ])
  subnetSiblings? = Schema<{ attachToNatGateway: boolean; subnet: Subnet }[]>([]);
}
