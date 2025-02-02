import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

export { AwsFilesystemSchema } from './models/filesystem/aws.filesystem.schema.js';

export class AwsFilesystemModuleSchema {
  @Validate({ options: { minLength: 1 } })
  filesystemName = Schema<string>();

  @Validate({
    options: {
      isModel: { anchors: [AwsRegionAnchorSchema], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();
}
