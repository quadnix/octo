import { Filesystem, Model } from '@quadnix/octo';
import { AwsEfsFilesystemSchema } from './aws-efs-filesystem.schema.js';

/**
 * @internal
 */
@Model<AwsEfsFilesystem>('@octo', 'filesystem', AwsEfsFilesystemSchema)
export class AwsEfsFilesystem extends Filesystem {
  /**
   * @internal
   */
  static override async unSynth(filesystem: AwsEfsFilesystemSchema): Promise<AwsEfsFilesystem> {
    return new AwsEfsFilesystem(filesystem.filesystemName);
  }
}
