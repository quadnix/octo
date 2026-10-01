import { BaseAnchorSchema, Schema, type Subnet, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Subnet} model in an AWS serverless region.
 * The subnet creates nothing; it is the one boundary that covers the whole region.
 *
 * @group Anchors/AwsServerlessSubnet
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsServerlessSubnetAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Subnet;

  /**
   * Input properties.
   * * `properties.serverless` - Always `true`. It sets this anchor apart from any other subnet anchor,
   * so a subnet with a network never matches this schema.
   * * `properties.subnetName` - The name of the subnet.
   */
  @Validate([
    {
      destruct: (value: AwsServerlessSubnetAnchorSchema['properties']): string[] => [value.subnetName],
      options: { minLength: 1 },
    },
    {
      options: {
        custom: (value: AwsServerlessSubnetAnchorSchema['properties']): boolean => value.serverless === true,
      },
    },
  ])
  override properties = Schema<{
    serverless: boolean;
    subnetName: string;
  }>();
}
