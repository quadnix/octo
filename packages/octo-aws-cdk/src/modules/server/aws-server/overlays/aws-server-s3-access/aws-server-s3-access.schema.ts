import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsServerS3AccessOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsServerS3AccessOverlaySchema['properties']): string[] => [
      String(value.allowRead),
      String(value.allowWrite),
      value.bucketName,
      value.accessPrefix,
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    accessPrefix: string;
    allowRead: boolean;
    allowWrite: boolean;
    bucketName: string;
    serverKey: string;
  }>();
}
