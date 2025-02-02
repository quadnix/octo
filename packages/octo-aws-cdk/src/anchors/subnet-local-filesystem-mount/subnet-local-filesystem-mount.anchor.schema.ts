import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class SubnetLocalFilesystemMountAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value: SubnetLocalFilesystemMountAnchorSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.filesystemName,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    filesystemName: string;
    subnetName: string;
  }>();
}
