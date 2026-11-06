import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsServerLambdaAccessOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsServerLambdaAccessOverlaySchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.functionName,
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    functionName: string;
    serverKey: string;
  }>();
}
