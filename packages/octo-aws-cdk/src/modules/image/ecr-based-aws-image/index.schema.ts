import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `AwsImageModuleSchema` is the input schema for the `AwsImageModule` module.
 * This schema defines the required inputs for creating ECR-based container images,
 * including naming and regional replication settings.
 *
 * @group Modules/Image/EcrBasedAwsImage
 *
 * @hideconstructor
 *
 * @see {@link AwsImageModule} to learn more about the `AwsImageModule` module.
 */
export class AwsImageModuleSchema {
  /**
   * The family name for the image.
   * This is used to group related images together in the ECR repository structure.
   */
  @Validate({ options: { minLength: 1 } })
  imageFamily = Schema<string>();

  /**
   * The specific name of the image within the family.
   * This identifies the specific image repository within the image family.
   */
  @Validate({ options: { minLength: 1 } })
  imageName = Schema<string>();

  /**
   * The AWS regions where the ECR repositories will be created.
   * The image will be available in all specified regions for multi-region deployments.
   * Each region must have AWS region anchors configured.
   */
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
