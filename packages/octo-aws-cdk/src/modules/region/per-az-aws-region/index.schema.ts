import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
import { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { AwsRegionSchema } from './models/region/aws.region.schema.js';
import { RegionId } from './models/region/index.js';

export { AwsRegionAnchorSchema, AwsRegionSchema, InternetGatewaySchema, RegionId, SecurityGroupSchema, VpcSchema };

export class AwsRegionModuleSchema {
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  @Validate({ options: { minLength: 1 } })
  regionId = Schema<RegionId>();

  @Validate({ options: { minLength: 1 } })
  vpcCidrBlock = Schema<string>();
}
