import { BaseAnchorSchema, Schema, type Server, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Server} model built by an AWS server module.
 * It names the server and holds what the server's code may reach, for any AWS execution module to
 * grant to the role it runs the code as, whichever runtime that is.
 *
 * @group Anchors/AwsServer
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsServerAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Server;

  /**
   * Input properties.
   * * `properties.grants.dynamodb` - The DynamoDB tables the code may reach, each by name, and whether it
   * may read and write them.
   * * `properties.grants.s3` - The S3 bucket prefixes the code may reach, each by bucket and prefix, and
   * whether it may read and write them.
   * * `properties.serverKey` - The server key.
   */
  @Validate({
    destruct: (value: AwsServerAnchorSchema['properties']): string[] => [
      ...value.grants.dynamodb.map((g) => g.tableName),
      ...value.grants.s3.map((g) => g.bucketName),
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    grants: {
      dynamodb: { allowRead: boolean; allowWrite: boolean; tableName: string }[];
      s3: { accessPrefix: string; allowRead: boolean; allowWrite: boolean; bucketName: string }[];
    };
    serverKey: string;
  }>();
}
