import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsServerlessRegionId } from './models/region/index.js';

export { AwsServerlessRegionId };

/**
 * `AwsServerlessRegionModuleSchema` is the input schema for the `AwsServerlessRegionModule` module.
 * This schema defines the required inputs for an AWS region that holds serverless things only.
 *
 * @group Modules/Region/AwsServerlessRegion
 *
 * @hideconstructor
 *
 * @see {@link AwsServerlessRegionModule} to learn more about the `AwsServerlessRegionModule` module.
 */
export class AwsServerlessRegionModuleSchema {
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
      destruct: (value: AwsServerlessRegionModuleSchema['account']): [AccountSchema] => [value.synth()],
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
   * The AWS region.
   */
  @Validate({ options: { minLength: 1 } })
  regionId = Schema<AwsServerlessRegionId>();
}
