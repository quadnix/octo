import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

const S3_STORAGE_CORS_METHODS = ['DELETE', 'GET', 'HEAD', 'POST', 'PUT'] as const;
/**
 * An HTTP method a CORS rule of the s3 storage may allow.
 *
 * @group Resources/S3Storage
 */
export type IS3StorageCorsMethod = (typeof S3_STORAGE_CORS_METHODS)[number];

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
 * Defines the schema for a CORS rule of the s3 storage, which lets a page on another origin call the
 * bucket from a browser, e.g. to upload through a presigned URL or read a range of an object.
 *
 * S3 answers a request with the first rule its origin, method and headers all match.
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 */
export class S3StorageCorsRuleSchema {
  /**
   * The request headers the calling page may send, e.g. `['Range']` to read part of an object.
   * A name may use one `*`, and `*` alone allows every header. Header names are not case-sensitive.
   */
  @Validate({
    destruct: (value: S3StorageCorsRuleSchema['allowHeaders']): string[] => value!,
    options: { minLength: 1 },
  })
  allowHeaders? = Schema<string[]>([]);

  /**
   * The methods the calling page may use. See {@link IS3StorageCorsMethod}.
   */
  @Validate<unknown>([
    {
      destruct: (value: S3StorageCorsRuleSchema['allowMethods']): string[][] => [value],
      options: { minLength: 1 },
    },
    {
      destruct: (value: S3StorageCorsRuleSchema['allowMethods']): string[] => value,
      options: { custom: (value: string): boolean => (S3_STORAGE_CORS_METHODS as readonly string[]).includes(value) },
    },
  ])
  allowMethods = Schema<IS3StorageCorsMethod[]>();

  /**
   * The origins allowed to call, each a scheme, a host, and a port when it is not the default, e.g.
   * `https://app.example.com`. An origin may use one `*`, e.g. `https://*.example.com`, and `*`
   * alone allows every origin.
   */
  @Validate<unknown>([
    {
      destruct: (value: S3StorageCorsRuleSchema['allowOrigins']): string[][] => [value],
      options: { minLength: 1 },
    },
    {
      destruct: (value: S3StorageCorsRuleSchema['allowOrigins']): string[] => value,
      options: { minLength: 1 },
    },
  ])
  allowOrigins = Schema<string[]>();

  /**
   * The response headers the calling page may read beyond the ones every browser shows, e.g.
   * `['ETag']`.
   */
  @Validate({
    destruct: (value: S3StorageCorsRuleSchema['exposeHeaders']): string[] => value!,
    options: { minLength: 1 },
  })
  exposeHeaders? = Schema<string[]>([]);

  /**
   * How long a browser may reuse the answer to a preflight request, in seconds. Omit it to let the
   * browser decide.
   */
  @Validate({
    destruct: (value: S3StorageCorsRuleSchema['maxAgeSeconds']): number[] => {
      const subjects: number[] = [];
      if (value !== null && value !== undefined) {
        subjects.push(value);
      }
      return subjects;
    },
    options: { minLength: 0 },
  })
  maxAgeSeconds? = Schema<number | null>(null);
}

/**
 * Defines the schema for a lifecycle rule of the s3 storage, which expires the objects it matches
 * some days after each was written.
 *
 * A rule matches the objects under its `prefix` that carry every one of its `tags`. With neither, it
 * matches every object in the bucket.
 *
 * @group Resources/S3Storage
 *
 * @hideconstructor
 */
export class S3StorageLifecycleRuleSchema {
  /**
   * The number of days after an object was written that it expires and is deleted.
   */
  @Validate({ options: { minLength: 1 } })
  expirationInDays = Schema<number>();

  /**
   * The key prefix the rule is limited to, e.g. `uploads/`. Omit it to match the whole bucket.
   */
  @Validate({
    options: { custom: (value: unknown): boolean => typeof value === 'string' },
  })
  prefix? = Schema<string>('');

  /**
   * The tags an object must carry, every one of them, for the rule to match it, e.g. `{ upload: 'pending' }`.
   */
  @Validate({
    options: {
      custom: (value: unknown): boolean =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((v) => typeof v === 'string'),
    },
  })
  tags? = Schema<{ [key: string]: string }>({});
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
 * once a principal is admitted,
 * [`aws_s3_bucket_cors_configuration`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_cors_configuration)
 * once it has a CORS rule, and
 * [`aws_s3_bucket_lifecycle_configuration`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration)
 * once it has a lifecycle rule.
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
   * * `properties.corsRules` - The rules letting a page on another origin call the bucket. See {@link S3StorageCorsRuleSchema} for options.
   * * `properties.lifecycleRules` - The rules expiring the bucket's objects. See {@link S3StorageLifecycleRuleSchema} for options.
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
      destruct: (value: S3StorageSchema['properties']): S3StorageCorsRuleSchema[] => value.corsRules,
      options: { isSchema: { schema: S3StorageCorsRuleSchema } },
    },
    {
      destruct: (value: S3StorageSchema['properties']): S3StorageLifecycleRuleSchema[] => value.lifecycleRules,
      options: { isSchema: { schema: S3StorageLifecycleRuleSchema } },
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
    corsRules: S3StorageCorsRuleSchema[];
    lifecycleRules: S3StorageLifecycleRuleSchema[];
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
