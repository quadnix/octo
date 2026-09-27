import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The distribution an invalidation is issued against. Structural, so any resource publishing a
 * distribution id satisfies it.
 *
 * @internal
 */
export class InvalidationDistributionSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: InvalidationDistributionSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.DistributionId) {
        subjects.push(value.DistributionId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    DistributionId?: string;
  }>({
    DistributionId: 'E000000000000',
  });
}

/**
 * The `CloudFrontInvalidationSchema` class is the schema for the `CloudFrontInvalidation` resource,
 * which drops what CloudFront's edge locations are holding for a distribution.
 *
 * Terraform provisions no part of it. There is no managed resource in the AWS provider for an
 * invalidation, because an invalidation is not a thing that exists - it is a call that runs and
 * finishes. So this is an external resource: octo issues `CreateInvalidation` itself, through the
 * `octo run-action` callback terraform makes mid-apply.
 *
 * It exists because the alternative is silent. A distribution serving a bucket caches an object for
 * as long as its cache policy says, which for `Managed-CachingOptimized` is a day, and an S3 object
 * carries no `Cache-Control` of its own. Without this, uploading a new version of a site reports
 * success and changes nothing a visitor can see until the next day.
 *
 * @group Resources/CloudFrontInvalidation
 *
 * @hideconstructor
 *
 * @overrideProperty parents - The distribution whose edge caches are dropped, and the bucket whose
 * files they hold, so the invalidation runs after the upload.
 * ```mermaid
 * graph TD;
 *   cloudfront_distribution((CloudFront<br>Distribution)) --> cloudfront_invalidation((CloudFront<br>Invalidation))
 *   s3_static_content((S3<br>Static<br>Content)) --> cloudfront_invalidation
 * ```
 * @overrideProperty resourceId - The resource id is of format
 * `cloudfront-invalidation-<distribution-name>-<bucket-name>`.
 */
export class CloudFrontInvalidationSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.contentVersion` - What the distribution is currently serving. It is not read by
   * the call; it is the whole trigger. Octo re-runs this resource when this value moves, and does
   * nothing when it does not, so whoever owns the content decides when an invalidation happens by
   * deciding what this says. A digest over the published files is the usual answer.
   * * `properties.paths` - The paths to drop, e.g. `/*`. AWS bills per path beyond the first
   * thousand a month, and `/*` counts as one.
   */
  @Validate({
    destruct: (value: CloudFrontInvalidationSchema['properties']): string[] => [
      value.awsAccountId,
      value.contentVersion,
      ...value.paths,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    contentVersion: string;
    paths: string[];
  }>();

  /**
   * Saved response.
   * * `response.InvalidationId` - The id AWS assigned the invalidation that ran.
   */
  @Validate({
    destruct: (value: CloudFrontInvalidationSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.InvalidationId) {
        subjects.push(value.InvalidationId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    InvalidationId?: string;
  }>({
    InvalidationId: 'I000000000000',
  });
}
