import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { RegionId } from './models/region/index.js';

export { RegionId };

/**
 * `AwsRegionModuleSchema` is the input schema for the `AwsRegionModule` module.
 * This schema defines the required inputs for creating AWS regions within a single availability zone.
 * Having all resources within a single availability zone ensures maximum network speed.
 *
 * @group Modules/Region/PerAzAwsRegion
 *
 * @hideconstructor
 *
 * @see {@link AwsRegionModule} to learn more about the `AwsRegionModule` module.
 */
export class AwsRegionModuleSchema {
  /**
   * The AWS account that this region will be associated with.
   * Only AWS account types are supported for this module.
   */
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  /**
   * The unique availability zone for the AWS region.
   * The region will be created in this availability zone.
   */
  @Validate({ options: { minLength: 1 } })
  regionId = Schema<RegionId>();

  /**
   * The CIDR block for the VPC in this region.
   * This defines the IP address range for the virtual network infrastructure.
   */
  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
