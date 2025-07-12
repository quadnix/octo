import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the schema for the s3 storage to allow permissions to a principal resource.
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 */
export class S3StoragePermissionSchema {
  /**
   * Allow read.
   */
  @Validate({ options: { minLength: 1 } })
  allowRead = Schema<boolean>();

  /**
   * Allow write.
   */
  @Validate({ options: { minLength: 1 } })
  allowWrite = Schema<boolean>();

  /**
   * The resource id of the principal resource.
   */
  @Validate({ options: { minLength: 1 } })
  principalResourceId = Schema<string>();

  /**
   * The path within the bucket this permission is for.
   * If you want to allow access to the entire bucket, use empty string `''`.
   */
  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath = Schema<string>();
}

/**
 * @internal
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
 * The `S3StorageSchema` class is the schema for the `S3Storage` resource,
 * which represents the AWS Simple Storage Service (S3) Bucket resource.
 * This resource can create an S3 bucket in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/).
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   principal_resource((Principal<br>Resource)) --> s3_storage((S3<br>Storage))
 * ```
 * @overrideProperty resourceId - The resource id is of format `bucket-<bucket-name>`
 */
export class S3StorageSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.Bucket` - The name of the bucket.
   * * `properties.permissions` - The permissions for the bucket. See {@link S3StoragePermissionSchema} for options.
   */
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

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the bucket.
   */
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
