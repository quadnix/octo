import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class S3StoragePermissionSchema {
  @Validate({ options: { minLength: 1 } })
  allowRead: boolean;

  @Validate({ options: { minLength: 1 } })
  allowWrite: boolean;

  @Validate({ options: { minLength: 1 } })
  principalResourceId: string;

  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath: string;
}

export class PrincipalResourceSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: PrincipalResourceSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
  }>();
}

export class S3StorageSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: S3StorageSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.Bucket,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: S3StorageSchema['properties']): S3StoragePermissionSchema[] => value.permissions,
      options: { isSchema: { schema: S3StoragePermissionSchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    Bucket: string;
    permissions: S3StoragePermissionSchema[];
  }>();

  override response = Schema<Record<never, never>>();
}
