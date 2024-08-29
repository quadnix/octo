import { type Options, Upload } from '@aws-sdk/lib-storage';
import { Factory } from '@quadnix/octo';

@Factory<Upload>(Upload)
export class S3UploadAwsFactory {
  static async create(options: Options): Promise<Upload> {
    if (!options) {
      throw new Error(`Failed to create instance of ${this.name} due to insufficient arguments!`);
    }
    return new Upload(options);
  }
}
