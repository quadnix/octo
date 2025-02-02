import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

export { AwsS3StorageServiceSchema } from './models/s3-storage/aws-s3-storage.service.schema.js';

export class AwsS3StorageServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({
    options: {
      isModel: { anchors: [AwsRegionAnchorSchema], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  @Validate({
    destruct: (value: AwsS3StorageServiceModuleSchema['remoteDirectoryPaths']): string[] => value!,
    options: { minLength: 1 },
  })
  remoteDirectoryPaths? = Schema<string[]>([]);
}
