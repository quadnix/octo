import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsSimpleSubnetLocalFilesystemMountOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsSimpleSubnetLocalFilesystemMountOverlaySchema['properties']): string[] => [
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
