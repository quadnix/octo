import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsSingleAzRegionId } from './models/region/index.js';

export { AwsSingleAzRegionId };

/**
 * `AwsSingleAzRegionModuleSchema` is the input schema for the `AwsSingleAzRegionModule` module.
 * This schema defines the required inputs for creating AWS regions within a single availability zone.
 * Having all resources within a single availability zone ensures maximum network speed.
 *
 * @group Modules/Region/AwsSingleAzRegion
 *
 * @hideconstructor
 *
 * @see {@link AwsSingleAzRegionModule} to learn more about the `AwsSingleAzRegionModule` module.
 */
export class AwsSingleAzRegionModuleSchema {
  /**
   * The AWS account that this region will be associated with.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      },
    },
    {
      destruct: (value: AwsSingleAzRegionModuleSchema['account']): [AccountSchema] => [value.synth()],
      options: {
        isSchema: { schema: AccountSchema },
      },
    },
  ])
  account = Schema<Account>();

  /**
   * The name of the region.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * The availability zone for the AWS region.
   * The region will be created in this availability zone.
   */
  @Validate({ options: { minLength: 1 } })
  regionId = Schema<AwsSingleAzRegionId>();

  /**
   * The CIDR block for the VPC in this region.
   * This defines the IP address range for the virtual network infrastructure.
   * The CIDR range should not overlap with any other CIDR ranges in the account.
   */
  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
