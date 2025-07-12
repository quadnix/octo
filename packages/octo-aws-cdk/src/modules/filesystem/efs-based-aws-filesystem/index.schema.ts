import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * `AwsFilesystemModuleSchema` is the input schema for the `AwsFilesystemModule` module.
 * This schema defines the required inputs for creating EFS-based filesystems,
 * including naming and region association.
 *
 * @group Modules/Filesystem/EfsBasedAwsFilesystem
 *
 * @hideconstructor
 *
 * @see {@link AwsFilesystemModule} to learn more about the `AwsFilesystemModule` module.
 */
export class AwsFilesystemModuleSchema {
  /**
   * The name of the filesystem.
   * This name is used to identify the EFS filesystem and must be unique within the region.
   */
  @Validate({ options: { minLength: 1 } })
  filesystemName = Schema<string>();

  /**
   * The AWS region where the filesystem will be created.
   * The region must have AWS region anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();
}
