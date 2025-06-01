import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { RegionId } from './models/region/index.js';

export { RegionId };
export { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
export { AwsRegionSchema } from './models/region/aws.region.schema.js';
export { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
export { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
export { VpcSchema } from '../../../resources/vpc/index.schema.js';

export class AwsRegionModuleSchema {
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  @Validate({ options: { minLength: 1 } })
  regionId = Schema<RegionId>();

  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
