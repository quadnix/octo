import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class S3StoragePermissionSchema {
  @Validate({ options: { minLength: 1 } })
  allowRead = Schema<boolean>();

  @Validate({ options: { minLength: 1 } })
  allowWrite = Schema<boolean>();

  @Validate({ options: { minLength: 1 } })
  principalResourceId = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath = Schema<string>();
}

/**
 * @group Resources/S3Storage
 *
 * @hideconstructor
 */
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

/**
 * @group Resources/S3Storage
 * @hideconstructor
 */
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

  @Validate({
    destruct: (value: S3StorageSchema['response']): string[] => {
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
