import { BaseAnchorSchema, Schema, type Subnet, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Subnet} model representing an AWS subnet.
 *
 * @group Anchors/AwsSubnet
 *
 * @hideconstructor
 */
export class AwsSubnetAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Subnet;

  /**
   * Input properties.
   * * `properties.AvailabilityZone` - The availability zone for the subnet.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.CidrBlock` - The CIDR block for the subnet.
   * * `properties.subnetName` - The name of the subnet.
   */
  @Validate({
    destruct: (value: AwsSubnetAnchorSchema['properties']): string[] => [
      value.AvailabilityZone,
      value.awsAccountId,
      value.awsRegionId,
      value.CidrBlock,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    AvailabilityZone: string;
    awsAccountId: string;
    awsRegionId: string;
    CidrBlock: string;
    subnetName: string;
  }>();
}
