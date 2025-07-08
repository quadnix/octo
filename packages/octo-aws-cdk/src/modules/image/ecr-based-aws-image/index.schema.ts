import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * @group Modules/Image/EcrBasedAwsImage
 *
 * @hideconstructor
 */
export class AwsImageModuleSchema {
  @Validate({ options: { minLength: 1 } })
  imageFamily = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  imageName = Schema<string>();

  @Validate([
    {
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsImageModuleSchema['regions']): Region[] => value,
      options: {
        isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  regions = Schema<Region[]>();
}
