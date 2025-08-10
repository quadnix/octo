import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsMultiAzRegionId } from './models/region/index.js';

export { AwsMultiAzRegionId };

/**
 * `AwsMultiAzRegionModuleSchema` is the input schema for the `AwsMultiAzRegionModule` module.
 * This schema defines the required inputs for creating AWS regions with multiple availability zones.
 *
 * @group Modules/Region/AwsMultiAzRegion
 *
 * @hideconstructor
 *
 * @see {@link AwsMultiAzRegionModule} to learn more about the `AwsMultiAzRegionModule` module.
 */
export class AwsMultiAzRegionModuleSchema {
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
      destruct: (value: AwsMultiAzRegionModuleSchema['account']): [AccountSchema] => [value.synth()],
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
   * The availability zones for the AWS region.
   * The region will be created in these availability zones.
   */
  @Validate([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsMultiAzRegionModuleSchema['regionIds']): AwsMultiAzRegionId[] => value,
      options: { minLength: 1 },
    },
  ])
  regionIds = Schema<AwsMultiAzRegionId[]>();

  /**
   * The CIDR block for the VPC in this region.
   * This defines the IP address range for the virtual network infrastructure.
   * The CIDR range should not overlap with any other CIDR ranges in the account.
   */
  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
