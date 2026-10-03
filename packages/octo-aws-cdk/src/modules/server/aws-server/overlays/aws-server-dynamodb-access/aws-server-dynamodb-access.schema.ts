import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsServerDynamoDBAccessOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsServerDynamoDBAccessOverlaySchema['properties']): string[] => [
      String(value.allowRead),
      String(value.allowWrite),
      value.awsRegionId,
      value.serverKey,
      value.tableName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    allowRead: boolean;
    allowWrite: boolean;
    awsRegionId: string;
    serverKey: string;
    tableName: string;
  }>();
}
