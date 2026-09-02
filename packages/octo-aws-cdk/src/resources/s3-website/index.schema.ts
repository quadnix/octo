import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * A CloudFront distribution this bucket serves. Structural, so the bucket never has to know what
 * kind of resource is in front of it - only that it publishes an ARN to name in a policy.
 *
 * @internal
 */
export class WebsiteDistributionSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: WebsiteDistributionSchema['response']): string[] => {
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
    Arn: 'arn:aws:cloudfront::000000000000:distribution/E000000000000',
  });
}

/**
 * The `S3WebsiteSchema` class is the schema for the `S3Website` resource,
 * which represents the AWS Simple Storage Service (S3) Website resource.
 * Terraform provisions it as
 * [`aws_s3_object`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_object).
 *
 * @group Resources/S3Website
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `bucket-<bucket-name>`
 */
export class S3WebsiteSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.Bucket` - The name of the bucket.
   * * `properties.ErrorDocument` - Path of the error document, e.g. `error.html`.
   * * `properties.IndexDocument` - Path of the index document, e.g. `index.html`.
   * * `properties.distributionResourceIds` - The distributions allowed to read this bucket, each
   * granted one statement in the policy below. It is also what decides how the bucket is reached:
   * empty leaves the bucket public on its S3 website endpoint, over plain HTTP, and anything else
   * closes it so that the distributions in front of it are the only way in. Two facts would
   * disagree eventually, so there is only this one.
   */
  @Validate({
    destruct: (value: S3WebsiteSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.Bucket,
      value.ErrorDocument,
      value.IndexDocument,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    Bucket: string;
    distributionResourceIds: string[];
    ErrorDocument: string;
    IndexDocument: string;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the bucket.
   * * `response.awsRegionId` - The AWS region id.
   * * `response.RegionalDomainName` - The bucket's REST endpoint, which is what a CloudFront origin
   * points at.
   */
  @Validate({
    destruct: (value: S3WebsiteSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.awsRegionId) {
        subjects.push(value.awsRegionId);
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
    RegionalDomainName?: string;
  }>({
    Arn: 'arn:aws:s3:::mock-website-bucket',
    awsRegionId: 'us-east-1',
    RegionalDomainName: 'mock-website-bucket.s3.us-east-1.amazonaws.com',
  });

  sourcePathDigests = Schema<{ [remotePath: string]: string }>({});
}
