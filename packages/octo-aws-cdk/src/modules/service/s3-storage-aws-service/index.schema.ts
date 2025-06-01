import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { S3DirectoryAnchorSchema } from '../../../anchors/s3-directory/s3-directory.anchor.schema.js';
import { S3StorageAnchorSchema } from '../../../anchors/s3-storage/s3-storage.anchor.schema.js';
import { PrincipalResourceSchema, S3StorageSchema } from '../../../resources/s3-storage/index.schema.js';
import { AwsS3StorageServiceSchema } from './models/s3-storage/aws-s3-storage.service.schema.js';

export {
  AwsS3StorageServiceSchema,
  PrincipalResourceSchema,
  S3DirectoryAnchorSchema,
  S3StorageAnchorSchema,
  S3StorageSchema,
};

export class AwsS3StorageServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
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
