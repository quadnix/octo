import { BaseOverlaySchema, Schema } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontAlbOriginOverlaySchema extends BaseOverlaySchema {
  override properties = Schema<{ albName: string }>();
}
