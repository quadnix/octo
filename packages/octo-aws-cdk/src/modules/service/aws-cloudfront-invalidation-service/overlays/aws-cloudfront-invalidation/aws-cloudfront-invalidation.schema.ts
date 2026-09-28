import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontInvalidationOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsCloudFrontInvalidationOverlaySchema['properties']): string[] => [
      value.awsAccountId,
      value.bucketName,
      value.contentDigest,
      value.distributionName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    bucketName: string;
    contentDigest: string;
    distributionName: string;
  }>();
}
