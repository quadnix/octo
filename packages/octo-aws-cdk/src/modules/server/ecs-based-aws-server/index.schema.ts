import { type Account, AccountSchema, Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { S3StorageAnchorSchema } from '../../../anchors/s3-storage/s3-storage.anchor.schema.js';
import {
  SecurityGroupAnchorRuleSchema,
  SecurityGroupAnchorSchema,
} from '../../../anchors/security-group/security-group.anchor.schema.js';

export { SecurityGroupAnchorRuleSchema, SecurityGroupAnchorSchema };
export { EcsServerAnchorSchema } from '../../../anchors/ecs-server/ecs-server.anchor.schema.js';
export { IamRoleAnchorSchema } from '../../../anchors/iam-role/iam-role.anchor.schema.js';
export { AwsServerSchema } from './models/server/aws.server.schema.js';
export { AwsServerS3AccessSchema } from './overlays/server-s3-access/aws-server-s3-access.schema.js';
export { IamRoleSchema, type IIamRoleS3BucketPolicy } from '../../../resources/iam-role/index.schema.js';
export { PrincipalResourceSchema, S3StorageSchema } from '../../../resources/s3-storage/index.schema.js';

class S3StorageServiceDirectorySchema {
  @Validate({ options: { minLength: 1 } })
  access = Schema<S3StorageAccess>();

  @Validate({ options: { minLength: 1 } })
  remoteDirectoryPath = Schema<string>();
}

export class AwsServerModuleSchema {
  @Validate({ options: { isSchema: { schema: AccountSchema } } })
  account = Schema<Account>();

  @Validate<unknown>([
    {
      destruct: (value: AwsServerModuleSchema['s3']): S3StorageServiceDirectorySchema[] =>
        value!.map((v) => v.directories).flat(),
      options: { isSchema: { schema: S3StorageServiceDirectorySchema } },
    },
    {
      destruct: (value: AwsServerModuleSchema['s3']): Service[] => value!.map((v) => v.service),
      options: {
        isModel: { anchors: [S3StorageAnchorSchema], NODE_NAME: 'service' },
        isSchema: { schema: ServiceSchema },
      },
    },
  ])
  s3? = Schema<{ directories: S3StorageServiceDirectorySchema[]; service: Service }[]>([]);

  @Validate({
    destruct: (value: AwsServerModuleSchema['securityGroupRules']): SecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: SecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<SecurityGroupAnchorRuleSchema[]>([]);

  @Validate({ options: { minLength: 1 } })
  serverKey = Schema<string>();
}

export enum S3StorageAccess {
  READ = 'READ',
  READ_WRITE = 'READ_WRITE',
  WRITE = 'WRITE',
}
