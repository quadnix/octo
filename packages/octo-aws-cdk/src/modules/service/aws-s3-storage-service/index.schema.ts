import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `AwsS3StorageServiceModuleSchema` is the input schema for the `AwsS3StorageServiceModule` module.
 * This schema defines the configuration for S3-based storage services including bucket naming,
 * region placement, and directory organization.
 *
 * @group Modules/Service/AwsS3StorageService
 *
 * @hideconstructor
 *
 * @see {@link AwsS3StorageServiceModule} to learn more about the `AwsS3StorageServiceModule` module.
 */
export class AwsS3StorageServiceModuleSchema {
  /**
   * The name of the S3 bucket to create.
   * This name must be globally unique across all AWS accounts and regions.
   * Must follow S3 bucket naming conventions.
   */
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  /**
   * The AWS region where the S3 bucket will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  /**
   * Optional array of directory paths to create within the S3 bucket.
   * These directories provide organization for stored objects and can be used
   * for permission management and access control.
   */
  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['remoteDirectoryPaths']): string[] => value!,
    options: { minLength: 1 },
  })
  remoteDirectoryPaths? = Schema<string[]>([]);
}
