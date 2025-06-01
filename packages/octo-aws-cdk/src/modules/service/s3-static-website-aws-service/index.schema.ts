import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

import { S3WebsiteSchema } from '../../../resources/s3-website/index.schema.js';
import { AwsS3StaticWebsiteServiceSchema } from './models/s3-static-website/aws-s3-static-website.service.schema.js';

export { AwsS3StaticWebsiteServiceSchema, S3WebsiteSchema };

export class AwsS3StaticWebsiteServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  directoryPath = Schema<string>();

  filter? = Schema<((filePath: string) => boolean) | null>(null);

  @Validate({
    options: {
      isModel: { anchors: [AwsRegionAnchorSchema], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  subDirectoryOrFilePath? = Schema<string | null>(null);

  transform? = Schema<((filePath: string) => string) | null>(null);
}
