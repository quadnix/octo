import { type Account, AccountSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsSecurityGroupAnchorRuleSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';

/**
 * The level of access a server has to a bucket prefix or a table it is granted.
 *
 * @group Modules/Server/AwsServer
 */
export enum AwsServerAccessPermission {
  /**
   * Read-only access.
   */
  READ = 'READ',

  /**
   * Read and write access.
   */
  READ_WRITE = 'READ_WRITE',

  /**
   * Write-only access.
   */
  WRITE = 'WRITE',
}

/**
 * Schema for granting a server access to one access prefix of an S3 storage service.
 * The prefix must be one the storage service declared in its `accessPrefixes`.
 *
 * @group Modules/Server/AwsServer
 *
 * @hideconstructor
 */
export class AwsServerS3AccessPrefixSchema {
  /**
   * The type of access granted to the objects under the prefix.
   * See {@link AwsServerAccessPermission} for options.
   */
  @Validate({ options: { regex: /^(READ|READ_WRITE|WRITE)$/ } })
  access = Schema<AwsServerAccessPermission>();

  /**
   * The key prefix within the S3 bucket, e.g. `uploads`.
   */
  @Validate({ options: { minLength: 1 } })
  accessPrefix = Schema<string>();
}

/**
 * Schema for granting a server access to one DynamoDB table.
 *
 * @group Modules/Server/AwsServer
 *
 * @hideconstructor
 */
export class AwsServerDynamoDBAccessSchema {
  /**
   * The type of access granted to the table. Read covers the table's indexes too.
   * See {@link AwsServerAccessPermission} for options.
   */
  @Validate({ options: { regex: /^(READ|READ_WRITE|WRITE)$/ } })
  access = Schema<AwsServerAccessPermission>();

  /**
   * The DynamoDB service holding the table.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsDynamoDBAnchorSchema }], NODE_NAME: 'service' },
      },
    },
    {
      destruct: (value: AwsServerDynamoDBAccessSchema['service']): [ServiceSchema] => [value.synth()],
      options: {
        isSchema: { schema: ServiceSchema },
      },
    },
  ])
  service = Schema<Service>();
}

/**
 * `AwsServerModuleSchema` is the input schema for the `AwsServerModule` module.
 * This schema defines what a server's code may reach, and its network rules.
 *
 * @group Modules/Server/AwsServer
 *
 * @hideconstructor
 *
 * @see {@link AwsServerModule} to learn more about the `AwsServerModule` module.
 */
export class AwsServerModuleSchema {
  /**
   * The AWS account the server belongs to.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      },
    },
    {
      destruct: (value: AwsServerModuleSchema['account']): [AccountSchema] => [value.synth()],
      options: {
        isSchema: { schema: AccountSchema },
      },
    },
  ])
  account = Schema<Account>();

  /**
   * Optional DynamoDB tables the server's code may reach.
   * See {@link AwsServerDynamoDBAccessSchema} for options.
   */
  @Validate({
    destruct: (value: AwsServerModuleSchema['dynamodb']): AwsServerDynamoDBAccessSchema[] => value!,
    options: { isSchema: { schema: AwsServerDynamoDBAccessSchema } },
  })
  dynamodb? = Schema<AwsServerDynamoDBAccessSchema[]>([]);

  /**
   * Optional S3 storage access prefixes the server's code may reach.
   * * `s3.accessPrefixes`: An array of access prefix grants.
   * See {@link AwsServerS3AccessPrefixSchema} for options.
   * * `s3.service`: The S3 storage service holding the prefixes.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsServerModuleSchema['s3']): AwsServerS3AccessPrefixSchema[] =>
        value!.map((v) => v.accessPrefixes).flat(),
      options: { isSchema: { schema: AwsServerS3AccessPrefixSchema } },
    },
    {
      destruct: (value: AwsServerModuleSchema['s3']): Service[] => value!.map((v) => v.service),
      options: {
        isModel: { anchors: [{ schema: AwsS3StorageServiceAnchorSchema }], NODE_NAME: 'service' },
      },
    },
    {
      destruct: (value: AwsServerModuleSchema['s3']): ServiceSchema[] => value!.map((v) => v.service.synth()),
      options: {
        isSchema: { schema: ServiceSchema },
      },
    },
  ])
  s3? = Schema<{ accessPrefixes: AwsServerS3AccessPrefixSchema[]; service: Service }[]>([]);

  /**
   * Security group rules for the server, read by an execution that places the code in a network.
   * See {@link AwsSecurityGroupAnchorRuleSchema} for options.
   */
  @Validate({
    destruct: (value: AwsServerModuleSchema['securityGroupRules']): AwsSecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: AwsSecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<AwsSecurityGroupAnchorRuleSchema[]>([]);

  /**
   * A unique identifier for the server.
   */
  @Validate({ options: { minLength: 1 } })
  serverKey = Schema<string>();
}
