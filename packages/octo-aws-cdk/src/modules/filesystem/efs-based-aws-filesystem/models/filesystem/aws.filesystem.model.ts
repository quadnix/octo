import { Filesystem, Model } from '@quadnix/octo';
import { AwsFilesystemSchema } from './aws.filesystem.schema.js';

@Model<AwsFilesystem>('@octo', 'filesystem', AwsFilesystemSchema)
export class AwsFilesystem extends Filesystem {
  static override async unSynth(awsFilesystem: AwsFilesystemSchema): Promise<AwsFilesystem> {
    return new AwsFilesystem(awsFilesystem.filesystemName);
  }
}
