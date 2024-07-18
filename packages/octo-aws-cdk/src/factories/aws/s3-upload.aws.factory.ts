import { type Options, Upload } from '@aws-sdk/lib-storage';
import { Factory } from '@quadnix/octo';

@Factory<Upload>(Upload)
export class S3UploadAwsFactory {
  static async create(options: Options): Promise<Upload> {
    return new Upload(options);
  }
}
