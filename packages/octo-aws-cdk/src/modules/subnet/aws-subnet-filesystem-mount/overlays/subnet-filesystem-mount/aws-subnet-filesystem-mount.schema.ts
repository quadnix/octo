import { BaseOverlaySchema, Schema } from '@quadnix/octo';

export class AwsSubnetFilesystemMountSchema extends BaseOverlaySchema {
  override properties = Schema<{
    filesystemName: string;
    regionId: string;
    subnetId: string;
    subnetName: string;
  }>();
}
