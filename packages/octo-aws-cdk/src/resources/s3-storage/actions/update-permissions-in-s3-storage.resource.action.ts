import { DeleteBucketPolicyCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { S3ClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { S3Storage, type S3StorageManifestDiff } from '../s3-storage.resource.js';

/**
 * @internal
 */
@Action(S3Storage)
export class UpdatePermissionsInS3StorageResourceAction implements IResourceAction<S3Storage> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof S3Storage &&
      (diff.node.constructor as typeof S3Storage).NODE_NAME === 's3-storage' &&
      diff.field === 'update-permissions'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;
    const manifestDiff = diff.value as S3StorageManifestDiff;

    // Get instances.
    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    const bucketPolicy: {
      Statement: { Action: string[]; Effect: 'Allow'; Principal: { AWS: string[] }; Resource: string[]; Sid: string }[];
      Version: '2012-10-17';
    } = { Statement: [], Version: '2012-10-17' };
    for (const [remoteDirectoryPath, principals] of Object.entries(manifestDiff)) {
      for (const [principalResourceId, operation] of Object.entries(principals)) {
        if (operation === 'addDirectoryPermissions' || operation === 'updateDirectoryPermissions') {
          const principalArn = s3Storage.parents
            .find((p) => p.getActual().resourceId === principalResourceId)!
            .getSchemaInstanceInResourceAction().response.Arn;

          const permission = properties.permissions.find(
            (p) => p.principalResourceId === principalResourceId && p.remoteDirectoryPath === remoteDirectoryPath,
          )!;

          if (permission.allowRead) {
            bucketPolicy.Statement.push({
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: { AWS: [principalArn] },
              Resource: [
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}`,
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}/*`,
              ],
              Sid: PolicyUtility.getSafeSid(`${principalResourceId}-ReadPermission`),
            });
          }

          if (permission.allowWrite) {
            bucketPolicy.Statement.push({
              Action: ['s3:PutObject'],
              Effect: 'Allow',
              Principal: { AWS: [principalArn] },
              Resource: [
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}`,
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}/*`,
              ],
              Sid: PolicyUtility.getSafeSid(`${principalResourceId}-WritePermission`),
            });
          }
        } else {
          bucketPolicy.Statement.splice(
            bucketPolicy.Statement.findIndex((s) => s.Sid === `${principalResourceId}-ReadPermission`),
            1,
          );
          bucketPolicy.Statement.splice(
            bucketPolicy.Statement.findIndex((s) => s.Sid === `${principalResourceId}-WritePermission`),
            1,
          );
        }
      }
    }

    if (bucketPolicy.Statement.length > 0) {
      await s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: properties.Bucket,
          Policy: JSON.stringify(bucketPolicy),
        }),
      );
    } else {
      await s3Client.send(
        new DeleteBucketPolicyCommand({
          Bucket: properties.Bucket,
        }),
      );
    }
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    const s3Client = await this.container.get<S3Client, typeof S3ClientFactory>(S3Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof PutBucketPolicyCommand) {
        return;
      } else if (instance instanceof DeleteBucketPolicyCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<UpdatePermissionsInS3StorageResourceAction>(UpdatePermissionsInS3StorageResourceAction)
export class UpdatePermissionsInS3StorageResourceActionFactory {
  private static instance: UpdatePermissionsInS3StorageResourceAction;

  static async create(): Promise<UpdatePermissionsInS3StorageResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdatePermissionsInS3StorageResourceAction(container);
    }
    return this.instance;
  }
}
