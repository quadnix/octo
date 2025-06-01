import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AlbSchema } from '../../../resources/alb/index.schema.js';
import { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';

export { AlbSchema, SecurityGroupSchema };

export class AwsAlbServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  albName = Schema<string>();

  @Validate({
    options: {
      isModel: { anchors: [AwsRegionAnchorSchema], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  @Validate({
    destruct: (value: AwsAlbServiceModuleSchema['subnets']): string[] =>
      value.map((v) => [v.subnetCidrBlock, v.subnetName]).flat(),
    options: { minLength: 1 },
  })
  subnets = Schema<{ subnetCidrBlock: string; subnetName: string }[]>();
}
