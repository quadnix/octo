import { type Account, AccountSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { S3StorageAnchorSchema } from '../../../anchors/s3-storage/s3-storage.anchor.schema.js';
import { SecurityGroupAnchorRuleSchema } from '../../../anchors/security-group/security-group.anchor.schema.js';
import { AwsServerS3AccessSchema } from './overlays/server-s3-access/aws-server-s3-access.schema.js';

export { AwsServerS3AccessSchema };

/**
 * S3 storage access permissions for server modules.
 * This enum defines the level of access a server has in a S3 storage directory.
 *
 * @group Modules/Server/EcsBasedAwsServer
 */
export enum S3StorageAccess {
  /** Read-only access to S3 storage */
  READ = 'READ',

  /** Read and write access to S3 storage */
  READ_WRITE = 'READ_WRITE',

  /** Write-only access to S3 storage */
  WRITE = 'WRITE',
}

/**
 * Schema for S3 storage service directory access configuration.
 * This defines the access permissions for specific directories in S3 storage services.
 *
 * @group Modules/Server/EcsBasedAwsServer
 *
 * @hideconstructor
 */
export class S3StorageServiceDirectorySchema {
  /**
   * The type of access granted to the directory.
   * This determines whether the server can read, write, or both.
   * See {@link S3StorageAccess} for options.
   */
  @Validate({ options: { minLength: 1 } })
  access = Schema<S3StorageAccess>();

  /**
   * The path to the directory within the S3 bucket.
   * This specifies which directory the server will have access to.
   */
  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath = Schema<string>();
}

/**
 * `AwsServerModuleSchema` is the input schema for the `AwsServerModule` module.
 * This schema defines the configuration for ECS-based servers including AWS account association,
 * S3 storage access, security group rules, and server identification.
 *
 * @group Modules/Server/EcsBasedAwsServer
 * @hideconstructor
 *
 * @see {@link AwsServerModule} to learn more about the `AwsServerModule` module.
 */
export class AwsServerModuleSchema {
  /**
   * The AWS account where the server will be created.
   * This establishes the account context for the server infrastructure.
   */
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  /**
   * Optional S3 storage access configuration.
   * This defines which S3 storage and directories the server can access and with what permissions.
   * * `s3.directories`: An array of S3 storage directory access configurations.
   * See {@link S3StorageServiceDirectorySchema} for options.
   * * `s3.service`: The S3 storage service the server can access.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsServerModuleSchema['s3']): S3StorageServiceDirectorySchema[] =>
        value!.map((v) => v.directories).flat(),
      options: { isSchema: { schema: S3StorageServiceDirectorySchema } },
    },
    {
      destruct: (value: AwsServerModuleSchema['s3']): Service[] => value!.map((v) => v.service),
      options: {
        isModel: { anchors: [{ schema: S3StorageAnchorSchema }], NODE_NAME: 'service' },
        isSchema: { schema: ServiceSchema },
      },
    },
  ])
  s3? = Schema<{ directories: S3StorageServiceDirectorySchema[]; service: Service }[]>([]);

  /**
   * Security group rules to apply to the server.
   * These rules define the network traffic allowed to and from the server.
   * See {@link SecurityGroupAnchorRuleSchema} for options.
   */
  @Validate({
    destruct: (value: AwsServerModuleSchema['securityGroupRules']): SecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: SecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<SecurityGroupAnchorRuleSchema[]>([]);

  /**
   * A unique identifier for the server.
   * This key is used to identify the server within the application.
   */
  @Validate({ options: { minLength: 1 } })
  serverKey = Schema<string>();
}
