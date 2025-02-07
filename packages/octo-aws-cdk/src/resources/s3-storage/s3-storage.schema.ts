import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class S3StorageSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    Bucket: string;
    permissions: {
      allowRead: boolean;
      allowWrite: boolean;
      principalResourceId: string;
      remoteDirectoryPath: string;
    }[];
  }>();

  override response = Schema<Record<never, never>>();
}

export class PrincipalResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value: { Arn: string }): string[] => [value.Arn], options: { minLength: 1 } })
  override response = Schema<{
    Arn: string;
  }>();
}
