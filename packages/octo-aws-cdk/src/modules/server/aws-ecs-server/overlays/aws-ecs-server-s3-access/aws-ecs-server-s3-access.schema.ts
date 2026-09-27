import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsEcsServerS3AccessOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsEcsServerS3AccessOverlaySchema['properties']): string[] => [
      String(value.allowRead),
      String(value.allowWrite),
      value.bucketName,
      value.iamRoleName,
      value.iamRolePolicyId,
      value.accessPrefix,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    accessPrefix: string;
    allowRead: boolean;
    allowWrite: boolean;
    bucketName: string;
    iamRoleName: string;
    iamRolePolicyId: string;
  }>();
}
