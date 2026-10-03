import { BaseOverlaySchema, Schema } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsCloudFrontLambdaOriginOverlaySchema extends BaseOverlaySchema {
  override properties = Schema<{ originId: string }>();
}
