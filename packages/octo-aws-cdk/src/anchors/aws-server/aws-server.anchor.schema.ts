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
   * * `properties.grants.dynamodb` - The DynamoDB tables the code may reach, each by region and name, and
   * whether it may read and write them.
   * * `properties.grants.iamStatements` - The IAM statements the code is allowed, each by actions and
   * resource ARNs, as the user wrote them.
   * * `properties.grants.s3` - The S3 bucket prefixes the code may reach, each by bucket and prefix, and
   * whether it may read and write them.
   * * `properties.serverKey` - The server key.
   */
  @Validate({
    destruct: (value: AwsServerAnchorSchema['properties']): string[] => [
      ...value.grants.dynamodb.flatMap((g) => [g.awsRegionId, g.tableName]),
      ...value.grants.iamStatements.flatMap((g) => [...g.actions, ...g.resources]),
      ...value.grants.s3.map((g) => g.bucketName),
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    grants: {
      dynamodb: { allowRead: boolean; allowWrite: boolean; awsRegionId: string; tableName: string }[];
      iamStatements: { actions: string[]; resources: string[] }[];
      s3: { accessPrefix: string; allowRead: boolean; allowWrite: boolean; bucketName: string }[];
    };
    serverKey: string;
  }>();
}
