import { BaseOverlaySchema, Schema } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontS3OriginOverlaySchema extends BaseOverlaySchema {
  override properties = Schema<{ bucketName: string }>();
}
