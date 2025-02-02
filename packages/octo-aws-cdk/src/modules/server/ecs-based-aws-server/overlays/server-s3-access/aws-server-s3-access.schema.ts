import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

export class AwsServerS3AccessSchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsServerS3AccessSchema['properties']): string[] => [
      String(value.allowRead),
      String(value.allowWrite),
      value.bucketName,
      value.iamRoleName,
      value.iamRolePolicyId,
      value.remoteDirectoryPath,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    allowRead: boolean;
    allowWrite: boolean;
    bucketName: string;
    iamRoleName: string;
    iamRolePolicyId: string;
    remoteDirectoryPath: string;
  }>();
}
