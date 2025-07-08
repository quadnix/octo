import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { RegionId } from './models/region/index.js';

export { RegionId };

/**
 * @group Modules/Region/PerAzAwsRegion
 *
 * @hideconstructor
 */
export class AwsRegionModuleSchema {
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  @Validate({ options: { minLength: 1 } })
  regionId = Schema<RegionId>();

  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
