import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import { EfsSchema } from '../../../resources/efs/index.schema.js';
import { AwsFilesystemSchema } from './models/filesystem/aws.filesystem.schema.js';

export { AwsFilesystemSchema, EfsFilesystemAnchorSchema, EfsSchema };

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
