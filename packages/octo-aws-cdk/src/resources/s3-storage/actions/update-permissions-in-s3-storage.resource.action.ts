import { PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { type AResource, Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { S3Storage, type S3StorageManifestDiff } from '../s3-storage.resource.js';

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
    const s3Client = await this.container.get(S3Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

    const bucketPolicy: {
      Statement: { Action: string[]; Effect: 'Allow'; Principal: string; Resource: string[]; Sid: string }[];
      Version: '2012-10-17';
    } = { Statement: [], Version: '2012-10-17' };
    for (const [remoteDirectoryPath, principals] of Object.entries(manifestDiff)) {
      for (const [principalResourceId, operation] of Object.entries(principals)) {
        if (operation === 'addDirectoryPermissions' || operation === 'updateDirectoryPermissions') {
          const parents = Object.values(s3Storage.getParents())
            .flat()
            .map((d) => d.to as unknown as AResource<any, any>);
          const parent = parents.find((p) => p.resourceId === principalResourceId)!;
          const principalArn = parent.response.Arn;

          const permission = properties.permissions.find(
            (p) => p.principalResourceId === principalResourceId && p.remoteDirectoryPath === remoteDirectoryPath,
          )!;

          if (permission.allowRead) {
            bucketPolicy.Statement.push({
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: principalArn,
              Resource: [
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}`,
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}/*`,
              ],
              Sid: `${principalResourceId}-ReadPermission`,
            });
          }

          if (permission.allowWrite) {
            bucketPolicy.Statement.push({
              Action: ['s3:PutObject'],
              Effect: 'Allow',
              Principal: principalArn,
              Resource: [
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}`,
                `arn:aws:s3:::${properties.Bucket}/${remoteDirectoryPath}/*`,
              ],
              Sid: `${principalResourceId}-WritePermission`,
            });
          }
        }
      }
    }

    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: properties.Bucket,
        Policy: JSON.stringify(bucketPolicy),
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const s3Storage = diff.node as S3Storage;
    const properties = s3Storage.properties;

    const s3Client = await this.container.get(S3Client, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    s3Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof PutBucketPolicyCommand) {
        return;
      }
    };
  }
}

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
