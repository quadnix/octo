import { type Account, AccountSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsSecurityGroupAnchorRuleSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsEcsServerS3AccessOverlaySchema } from './overlays/aws-ecs-server-s3-access/aws-ecs-server-s3-access.schema.js';

export { AwsEcsServerS3AccessOverlaySchema };

/**
 * S3 directory access permissions for server modules.
 * This enum defines the level of access a server has in a S3 storage directory.
 *
 * @group Modules/Server/AwsEcsServer
 */
export enum AwsEcsServerS3AccessDirectoryPermission {
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
 * @group Modules/Server/AwsEcsServer
 *
 * @hideconstructor
 */
export class AwsEcsServerS3AccessDirectorySchema {
  /**
   * The type of access granted to the directory.
   * This determines whether the server can read, write, or both.
   * See {@link AwsEcsServerS3AccessDirectoryPermission} for options.
   */
  @Validate({ options: { minLength: 1 } })
  access = Schema<AwsEcsServerS3AccessDirectoryPermission>();

  /**
   * The path to the directory within the S3 bucket.
   * This specifies which directory the server will have access to.
   */
  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath = Schema<string>();
}

/**
 * `AwsEcsServerModuleSchema` is the input schema for the `AwsEcsServerModule` module.
 * This schema defines the configuration for ECS-based servers including AWS account association,
 * S3 storage access, security group rules, and server identification.
 *
 * @group Modules/Server/AwsEcsServer
 *
 * @hideconstructor
 *
 * @see {@link AwsEcsServerModule} to learn more about the `AwsEcsServerModule` module.
 */
export class AwsEcsServerModuleSchema {
  /**
   * The AWS account where the server will be created.
   * This establishes the account context for the server infrastructure.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      isSchema: { schema: AccountSchema },
    },
  })
  account = Schema<Account>();

  /**
   * Optional S3 storage access configuration.
   * This defines which S3 storage and directories the server can access and with what permissions.
   * * `s3.directories`: An array of S3 storage directory access configurations.
   * See {@link AwsEcsServerS3AccessDirectorySchema} for options.
   * * `s3.service`: The S3 storage service the server can access.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsEcsServerModuleSchema['s3']): AwsEcsServerS3AccessDirectorySchema[] =>
        value!.map((v) => v.directories).flat(),
      options: { isSchema: { schema: AwsEcsServerS3AccessDirectorySchema } },
    },
    {
      destruct: (value: AwsEcsServerModuleSchema['s3']): Service[] => value!.map((v) => v.service),
      options: {
        isModel: { anchors: [{ schema: AwsS3StorageServiceAnchorSchema }], NODE_NAME: 'service' },
        isSchema: { schema: ServiceSchema },
      },
    },
  ])
  s3? = Schema<{ directories: AwsEcsServerS3AccessDirectorySchema[]; service: Service }[]>([]);

  /**
   * Security group rules to apply to the server.
   * These rules define the network traffic allowed to and from the server.
   * See {@link AwsSecurityGroupAnchorRuleSchema} for options.
   */
  @Validate({
    destruct: (value: AwsEcsServerModuleSchema['securityGroupRules']): AwsSecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: AwsSecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<AwsSecurityGroupAnchorRuleSchema[]>([]);

  /**
   * A unique identifier for the server.
   * This key is used to identify the server within the application.
   */
  @Validate({ options: { minLength: 1 } })
  serverKey = Schema<string>();
}
