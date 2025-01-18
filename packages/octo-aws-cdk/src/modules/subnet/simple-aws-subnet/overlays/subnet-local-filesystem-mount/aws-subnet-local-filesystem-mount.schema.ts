import { BaseOverlaySchema, Schema } from '@quadnix/octo';

export class AwsSubnetLocalFilesystemMountSchema extends BaseOverlaySchema {
  override properties = Schema<{
    filesystemName: string;
    regionId: string;
    subnetId: string;
    subnetName: string;
  }>();
}
