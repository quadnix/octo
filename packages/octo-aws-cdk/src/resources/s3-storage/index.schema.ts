import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

const S3_STORAGE_PRINCIPAL_TYPES = ['aws', 'cloudfront'] as const;
/**
 * The kind of principal a permission admits.
 * * `aws` - An IAM principal, such as a role, named by its ARN.
 * * `cloudfront` - A CloudFront distribution, admitted through
 * [origin access control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).
 * It may only read.
 *
 * @group Resources/S3Storage
 */
export type IS3StoragePrincipalType = (typeof S3_STORAGE_PRINCIPAL_TYPES)[number];

/**
 * Defines the schema for the s3 storage to allow permissions to a principal resource.
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 */
export class S3StoragePermissionSchema {
  /**
   * The key prefix within the bucket this permission is for, e.g. `uploads`.
   * If you want to allow access to the entire bucket, use empty string `''`.
   */
  @Validate({ options: { custom: (value: unknown): boolean => typeof value === 'string' } })
  accessPrefix = Schema<string>();

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
   * The kind of principal the permission admits.
   */
  @Validate({
    options: { custom: (value: string): boolean => (S3_STORAGE_PRINCIPAL_TYPES as readonly string[]).includes(value) },
  })
  principalType = Schema<IS3StoragePrincipalType>();
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
  }>({
    Arn: 'arn:aws:s3:::mock-bucket',
  });
}

/**
 * The `S3StorageSchema` class is the schema for the `S3Storage` resource,
 * which represents the AWS Simple Storage Service (S3) Bucket resource.
 * Terraform provisions it as
 * [`aws_s3_bucket`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket),
 * [`aws_s3_bucket_public_access_block`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block)
 * when public access is blocked, one
 * [`aws_s3_object`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_object)
 * per uploaded file, and
 * [`aws_s3_bucket_policy`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy)
 * once a principal is admitted.
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 *
 * @overrideProperty parents - The principals admitted to the bucket.
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
   * * `properties.blockPublicAccess` - Blocks every public ACL and public policy on the bucket.
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
      destruct: (value: S3StorageSchema['properties']): boolean[] => [value.blockPublicAccess],
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
    blockPublicAccess: boolean;
    Bucket: string;
    permissions: S3StoragePermissionSchema[];
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the bucket.
   * * `response.awsRegionId` - The AWS region id.
   * * `response.Bucket` - The name of the bucket, as terraform created it.
   * * `response.RegionalDomainName` - The bucket's REST endpoint, which is what a CloudFront origin
   * points at.
   */
  @Validate({
    destruct: (value: S3StorageSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.awsRegionId) {
        subjects.push(value.awsRegionId);
      }
      if (value.Bucket) {
        subjects.push(value.Bucket);
      }
      if (value.RegionalDomainName) {
        subjects.push(value.RegionalDomainName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    awsRegionId?: string;
    Bucket?: string;
    RegionalDomainName?: string;
  }>({
    Arn: 'arn:aws:s3:::mock-bucket',
    awsRegionId: 'us-east-1',
    Bucket: 'mock-bucket',
    RegionalDomainName: 'mock-bucket.s3.us-east-1.amazonaws.com',
  });

  sourcePathDigests = Schema<{ [remotePath: string]: string }>({});
}
