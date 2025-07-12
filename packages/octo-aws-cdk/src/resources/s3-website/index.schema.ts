import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `S3WebsiteSchema` class is the schema for the `S3Website` resource,
 * which represents the AWS Simple Storage Service (S3) Website resource.
 * This resource can create a s3 website in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/).
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
    ErrorDocument: string;
    IndexDocument: string;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the bucket.
   * * `response.awsRegionId` - The AWS region id.
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
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    awsRegionId?: string;
  }>();
}
