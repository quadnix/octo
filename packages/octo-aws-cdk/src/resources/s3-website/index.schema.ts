import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/S3Website
 *
 * @hideconstructor
 */
export class S3WebsiteSchema extends BaseResourceSchema {
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
