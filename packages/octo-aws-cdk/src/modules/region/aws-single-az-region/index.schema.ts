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
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      isSchema: { schema: AccountSchema },
    },
  })
  account = Schema<Account>();

  /**
   * The unique availability zone for the AWS region.
   * The region will be created in this availability zone.
   */
  @Validate({ options: { minLength: 1 } })
  regionId = Schema<AwsSingleAzRegionId>();

  /**
   * The CIDR block for the VPC in this region.
   * This defines the IP address range for the virtual network infrastructure.
   */
  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
