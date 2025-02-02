import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import {
  AModule,
  type Account,
  AccountType,
  type App,
  Container,
  ContainerRegistrationError,
  Module,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { EcsServerAnchor } from '../../../anchors/ecs-server/ecs-server.anchor.js';
import { IamRoleAnchor } from '../../../anchors/iam-role/iam-role.anchor.js';
import { S3DirectoryAnchorSchema } from '../../../anchors/s3-directory/s3-directory.anchor.schema.js';
import { S3StorageAnchorSchema } from '../../../anchors/s3-storage/s3-storage.anchor.schema.js';
import { SecurityGroupAnchor } from '../../../anchors/security-group/security-group.anchor.js';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsServerModuleSchema, S3StorageAccess } from './index.schema.js';
import { AwsServer } from './models/server/index.js';
import { AwsServerS3AccessOverlay } from './overlays/server-s3-access/index.js';

@Module<AwsServerModule>('@octo', AwsServerModuleSchema)
export class AwsServerModule extends AModule<AwsServerModuleSchema, AwsServer> {
  async onInit(inputs: AwsServerModuleSchema): Promise<(AwsServer | AwsServerS3AccessOverlay)[]> {
    const models: (AwsServer | AwsServerS3AccessOverlay)[] = [];
    const { account, app, iamRoleName } = await this.registerMetadata(inputs);

    // Create a new server.
    const server = new AwsServer(inputs.serverKey);
    app.addServer(server);
    models.push(server);

    // Add server anchors.
    const ecsServerAnchor = new EcsServerAnchor(
      'EcsServerAnchor',
      { deploymentType: 'ecs', serverKey: server.serverKey },
      server,
    );
    server.addAnchor(ecsServerAnchor);
    const iamRoleAnchor = new IamRoleAnchor('IamRoleAnchor', { iamRoleName }, server);
    server.addAnchor(iamRoleAnchor);
    const securityGroupAnchor = new SecurityGroupAnchor(
      'SecurityGroupAnchor',
      { rules: [], securityGroupName: `SecurityGroup-${inputs.serverKey}` },
      server,
    );
    server.addAnchor(securityGroupAnchor);

    // Add security-group rules.
    for (const rule of inputs.securityGroupRules || []) {
      const existingRule = securityGroupAnchor.properties.rules.find(
        (r) =>
          r.CidrBlock === rule.CidrBlock &&
          r.Egress === rule.Egress &&
          r.FromPort === rule.FromPort &&
          r.IpProtocol === rule.IpProtocol &&
          r.ToPort === rule.ToPort,
      );
      if (!existingRule) {
        securityGroupAnchor.properties.rules.push(rule);
      }
    }

    const awsRegionIds: string[] = [];
    if (inputs.s3) {
      for (const s3 of inputs.s3 || []) {
        const service = s3.service;
        const [matchingS3StorageAnchor] = await service.getAnchorsMatchingSchema(S3StorageAnchorSchema, [], {
          searchBoundaryMembers: false,
        });

        if (matchingS3StorageAnchor.getSchemaInstance().properties.awsAccountId !== account.accountId) {
          throw new Error('This module does not support adding s3 resources from other accounts!');
        }

        const awsRegionId = matchingS3StorageAnchor.getSchemaInstance().properties.awsRegionId;
        if (awsRegionIds.indexOf(awsRegionId) === -1) {
          awsRegionIds.push(awsRegionId);
        }

        for (const directory of s3.directories) {
          const allowRead =
            directory.access === S3StorageAccess.READ || directory.access === S3StorageAccess.READ_WRITE;
          const allowWrite =
            directory.access === S3StorageAccess.WRITE || directory.access === S3StorageAccess.READ_WRITE;
          if (!allowRead && !allowWrite) {
            continue;
          }

          const matchingAnchors = await service.getAnchorsMatchingSchema(
            S3DirectoryAnchorSchema,
            [{ key: 'remoteDirectoryPath', value: directory.remoteDirectoryPath }],
            { searchBoundaryMembers: false },
          );
          if (matchingAnchors.length !== 1) {
            throw new Error('Cannot find remote directory in S3Storage service!');
          }
          const s3DirectoryAnchor = matchingAnchors[0];

          const overlayIdSuffix = CommonUtility.hash(
            iamRoleAnchor.anchorId,
            directory.remoteDirectoryPath,
            directory.access,
          ).substring(0, 12);
          const overlayId = `server-s3-access-overlay-${overlayIdSuffix}`;
          const serverS3AccessOverlay = new AwsServerS3AccessOverlay(
            overlayId,
            {
              allowRead,
              allowWrite,
              bucketName: s3DirectoryAnchor.getSchemaInstance().properties.bucketName,
              iamRoleName: iamRoleAnchor.properties.iamRoleName,
              iamRolePolicyId: overlayId,
              remoteDirectoryPath: directory.remoteDirectoryPath,
            },
            [iamRoleAnchor, s3DirectoryAnchor],
          );
          models.push(serverS3AccessOverlay);
        }
      }
    }

    // Create and register a new IAMClient and S3Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const container = Container.getInstance();
    try {
      const iamClient = new IAMClient({ ...credentials });
      container.registerValue(IAMClient, iamClient, {
        metadata: { awsAccountId: account.accountId, package: '@octo' },
      });

      for (const awsRegionId of awsRegionIds) {
        const s3Client = new S3Client({ ...credentials, region: awsRegionId });
        container.registerValue(S3Client, s3Client, {
          metadata: { awsAccountId: account.accountId, awsRegionId, package: '@octo' },
        });
      }
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return models;
  }

  override async registerMetadata(
    inputs: AwsServerModuleSchema,
  ): Promise<{ account: Account; app: App; iamRoleName: string }> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new Error('Only AWS accounts are supported in this module!');
    }
    const app = account.getParents()['app'][0].to as App;

    return {
      account,
      app,
      iamRoleName: `ServerRole-${inputs.serverKey}`,
    };
  }
}
