import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `AwsEcrImageModuleSchema` is the input schema for the `AwsEcrImageModule` module.
 * This schema defines the required inputs for creating ECR-based container images,
 * including naming and regional replication settings.
 *
 * @group Modules/Image/AwsEcrImage
 *
 * @hideconstructor
 *
 * @see {@link AwsEcrImageModule} to learn more about the `AwsEcrImageModule` module.
 */
export class AwsEcrImageModuleSchema {
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
      destruct: (value: AwsEcrImageModuleSchema['regions']): Region[] => value,
      options: {
        isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
        isSchema: { schema: RegionSchema },
      },
    },
  ])
  regions = Schema<Region[]>();
}
