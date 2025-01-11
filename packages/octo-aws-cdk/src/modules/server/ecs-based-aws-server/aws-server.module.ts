import { IAMClient } from '@aws-sdk/client-iam';
import {
  AModule,
  type Account,
  type App,
  BaseAnchorSchema,
  Container,
  ContainerRegistrationError,
  Module,
  Schema,
  type Service,
  ServiceSchema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsIamRoleAnchor } from './anchors/aws-iam-role.anchor.js';
import { AwsSecurityGroupAnchor, type ISecurityGroupAnchorRule } from './anchors/aws-security-group.anchor.js';
import { AwsServer } from './models/server/index.js';
import { AwsServerS3AccessOverlay } from './overlays/server-s3-access/index.js';

export enum S3StorageAccess {
  READ = 'READ',
  READ_WRITE = 'READ_WRITE',
  WRITE = 'WRITE',
}

export class AwsS3DirectoryAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value): string[] => [value.bucketName, [value.remoteDirectoryPath]],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    bucketName: string;
    remoteDirectoryPath: string;
  }>();
}

export class AwsS3StorageServiceSchema extends ServiceSchema {
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  @Validate([
    {
      destruct: (value: { remoteDirectoryPath: string }[]): string[] => value.map((v) => v.remoteDirectoryPath),
      options: { minLength: 1 },
    },
  ])
  directories? = Schema<{ remoteDirectoryPath: string }[]>([]);
}

export class AwsS3StorageServiceDirectorySchema {
  access = Schema<S3StorageAccess>();

  remoteDirectoryPath = Schema<string>();
}

export class AwsServerModuleSchema {
  account = Schema<Account>();

  @Validate<unknown>([
    {
      destruct: (
        value: { directories: AwsS3StorageServiceDirectorySchema[]; service: Service }[],
      ): AwsS3StorageServiceDirectorySchema[] => value.map((v) => v.directories).flat(),
      options: { isSchema: { schema: AwsS3StorageServiceDirectorySchema } },
    },
    {
      destruct: (value: { directories: AwsS3StorageServiceDirectorySchema[]; service: Service }[]): Service[] =>
        value.map((v) => v.service),
      options: { isModel: { NODE_NAME: 'service' }, isSchema: { schema: AwsS3StorageServiceSchema } },
    },
  ])
  s3? = Schema<{ directories: AwsS3StorageServiceDirectorySchema[]; service: Service }[]>([]);

  securityGroupRules? = Schema<ISecurityGroupAnchorRule[]>([]);

  serverKey = Schema<string>();
}

@Module<AwsServerModule>('@octo', AwsServerModuleSchema)
export class AwsServerModule extends AModule<AwsServerModuleSchema, AwsServer> {
  async onInit(inputs: AwsServerModuleSchema): Promise<(AwsServer | AwsServerS3AccessOverlay)[]> {
    const account = inputs.account;
    const app = account.getParents()['app'][0].to as App;

    // Create a new server.
    const server = new AwsServer(inputs.serverKey);
    app.addServer(server);

    const models: (AwsServer | AwsServerS3AccessOverlay)[] = [server];

    const awsIamRoleAnchor = new AwsIamRoleAnchor(
      'AwsIamRoleAnchor',
      { iamRoleName: `ServerRole-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(awsIamRoleAnchor);
    const awsSecurityGroupAnchor = new AwsSecurityGroupAnchor(
      'AwsSecurityGroupAnchor',
      { rules: [], securityGroupName: `SecurityGroup-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(awsSecurityGroupAnchor);

    // Add security-group rules.
    for (const rule of inputs.securityGroupRules || []) {
      const existingRule = awsSecurityGroupAnchor.properties.rules.find(
        (r) =>
          r.CidrBlock === rule.CidrBlock &&
          r.Egress === rule.Egress &&
          r.FromPort === rule.FromPort &&
          r.IpProtocol === rule.IpProtocol &&
          r.ToPort === rule.ToPort,
      );
      if (!existingRule) {
        awsSecurityGroupAnchor.properties.rules.push(rule);
      }
    }

    if (inputs.s3) {
      for (const s3 of inputs.s3 || []) {
        const service = s3.service;

        for (const directory of s3.directories) {
          const allowRead =
            directory.access === S3StorageAccess.READ || directory.access === S3StorageAccess.READ_WRITE;
          const allowWrite =
            directory.access === S3StorageAccess.WRITE || directory.access === S3StorageAccess.READ_WRITE;
          if (!allowRead && !allowWrite) {
            continue;
          }

          const matchingAnchors = await service.getAnchorsMatchingSchema(AwsS3DirectoryAnchorSchema, [
            { key: 'remoteDirectoryPath', value: directory.remoteDirectoryPath },
          ]);
          if (matchingAnchors.length !== 1) {
            throw new Error('Cannot find remote directory in service!');
          }
          const [, awsS3DirectoryAnchor] = matchingAnchors[0];

          const overlayIdSuffix = CommonUtility.hash(
            awsIamRoleAnchor.anchorId,
            directory.remoteDirectoryPath,
            directory.access,
          ).substring(0, 12);
          const overlayId = `server-s3-access-overlay-${overlayIdSuffix}`;
          const serverS3AccessOverlay = new AwsServerS3AccessOverlay(
            overlayId,
            {
              allowRead,
              allowWrite,
              bucketName: awsS3DirectoryAnchor.properties.bucketName,
              iamRoleName: awsIamRoleAnchor.properties.iamRoleName,
              iamRolePolicyId: overlayId,
              remoteDirectoryPath: directory.remoteDirectoryPath,
            },
            [awsIamRoleAnchor, awsS3DirectoryAnchor],
          );
          models.push(serverS3AccessOverlay);
        }
      }
    }

    // Create and register a new IAMClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const iamClient = new IAMClient({ ...credentials });
    const container = Container.getInstance();
    try {
      container.registerValue(IAMClient, iamClient, {
        metadata: { package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return models;
  }
}
