import { type Region, RegionSchema, Schema, Validate } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';

/**
 * @group Modules/Service/S3StaticWebsiteAwsService
 *
 * @hideconstructor
 */
export class AwsS3StaticWebsiteServiceModuleSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  directoryPath = Schema<string>();

  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['filter']): ((filePath: string) => boolean)[] => {
      const subjects: ((filePath: string) => boolean)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => boolean)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  filter? = Schema<((filePath: string) => boolean) | null>(null);

  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsRegionAnchorSchema }], NODE_NAME: 'region' },
      isSchema: { schema: RegionSchema },
    },
  })
  region = Schema<Region>();

  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['subDirectoryOrFilePath']): string[] => {
      const subjects: string[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  subDirectoryOrFilePath? = Schema<string | null>(null);

  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['transform']): ((filePath: string) => string)[] => {
      const subjects: ((filePath: string) => string)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => string)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  transform? = Schema<((filePath: string) => string) | null>(null);
}
