import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

export class AwsSubnetLocalFilesystemMountSchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsSubnetLocalFilesystemMountSchema['properties']): string[] => [
      value.filesystemName,
      value.regionId,
      value.subnetId,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    filesystemName: string;
    regionId: string;
    subnetId: string;
    subnetName: string;
  }>();
}
