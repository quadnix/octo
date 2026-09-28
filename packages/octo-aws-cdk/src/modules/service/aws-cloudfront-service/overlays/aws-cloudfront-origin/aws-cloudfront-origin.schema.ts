import { BaseOverlaySchema, Schema } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontOriginOverlaySchema extends BaseOverlaySchema {
  override properties = Schema<{ bucketName: string }>();
}
