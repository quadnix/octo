import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsServerDynamoDBAccessOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsServerDynamoDBAccessOverlaySchema['properties']): string[] => [
      String(value.allowRead),
      String(value.allowWrite),
      value.serverKey,
      value.tableName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    allowRead: boolean;
    allowWrite: boolean;
    serverKey: string;
    tableName: string;
  }>();
}
