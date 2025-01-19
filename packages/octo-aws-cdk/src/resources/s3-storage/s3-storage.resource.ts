import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { IamRole } from '../iam-role/index.js';
import { IamUser } from '../iam-user/index.js';
import { S3StorageSchema } from './s3-storage.schema.js';

export type S3StorageManifestDiff = {
  [key: string]: {
    [key: string]: 'addDirectoryPermissions' | 'deleteDirectoryPermissions' | 'updateDirectoryPermissions';
  };
};

@Resource<S3Storage>('@octo', 's3-storage', S3StorageSchema)
export class S3Storage extends AResource<S3StorageSchema, S3Storage> {
  declare properties: S3StorageSchema['properties'];
  declare response: S3StorageSchema['response'];

  constructor(resourceId: string, properties: Pick<S3StorageSchema['properties'], 'awsRegionId' | 'Bucket'>) {
    super(resourceId, { ...properties, permissions: [] }, []);
  }

  addPermission(
    principal: IamRole | IamUser,
    remoteDirectoryPath: string,
    options: { allowRead: boolean; allowWrite: boolean },
  ): void {
    const principalResourceId = principal.resourceId;

    const existingPermission = this.properties.permissions.find(
      (p) => p.principalResourceId === principalResourceId && p.remoteDirectoryPath === remoteDirectoryPath,
    );
    if (existingPermission) {
      existingPermission.allowRead = options.allowRead;
      existingPermission.allowWrite = options.allowWrite;
    } else {
      const { childToParentDependency, parentToChildDependency } = principal.addChild('resourceId', this, 'resourceId');
      childToParentDependency.addBehavior('update-permissions', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      parentToChildDependency.addBehavior('resourceId', DiffAction.DELETE, 'update-permissions', DiffAction.UPDATE);

      this.properties.permissions.push({
        allowRead: options.allowRead,
        allowWrite: options.allowWrite,
        principalResourceId,
        remoteDirectoryPath,
      });
    }
  }

  override async diff(previous: S3Storage): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const propertyDiffs = await this.diffProperties(previous);
    diffs.push(...propertyDiffs);

    return diffs;
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.field === 'update-permissions' && diff.action === DiffAction.UPDATE) {
      this.clonePropertiesInPlace(diff.node as S3Storage);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: S3Storage): Promise<Diff[]> {
    const diffs: Diff[] = [];
    const manifestDiff: S3StorageManifestDiff = {};

    for (const previousPermission of previous.properties.permissions) {
      const currentPermission = this.properties.permissions.find(
        (p) =>
          p.principalResourceId === previousPermission.principalResourceId &&
          p.remoteDirectoryPath === previousPermission.remoteDirectoryPath,
      );
      if (currentPermission) {
        if (
          currentPermission.allowRead !== previousPermission.allowRead ||
          currentPermission.allowWrite !== previousPermission.allowWrite
        ) {
          if (previousPermission.remoteDirectoryPath in manifestDiff) {
            manifestDiff[previousPermission.remoteDirectoryPath][previousPermission.principalResourceId] =
              'updateDirectoryPermissions';
          } else {
            manifestDiff[previousPermission.remoteDirectoryPath] = {
              [previousPermission.principalResourceId]: 'updateDirectoryPermissions',
            };
          }
        }
      } else {
        if (previousPermission.remoteDirectoryPath in manifestDiff) {
          manifestDiff[previousPermission.remoteDirectoryPath][previousPermission.principalResourceId] =
            'deleteDirectoryPermissions';
        } else {
          manifestDiff[previousPermission.remoteDirectoryPath] = {
            [previousPermission.principalResourceId]: 'deleteDirectoryPermissions',
          };
        }
      }
    }

    for (const currentPermission of this.properties.permissions) {
      const previousPermission = previous.properties.permissions.find(
        (p) =>
          p.principalResourceId === currentPermission.principalResourceId &&
          p.remoteDirectoryPath === currentPermission.remoteDirectoryPath,
      );
      if (!previousPermission) {
        if (currentPermission.remoteDirectoryPath in manifestDiff) {
          manifestDiff[currentPermission.remoteDirectoryPath][currentPermission.principalResourceId] =
            'addDirectoryPermissions';
        } else {
          manifestDiff[currentPermission.remoteDirectoryPath] = {
            [currentPermission.principalResourceId]: 'addDirectoryPermissions',
          };
        }
      }
    }

    if (Object.keys(manifestDiff).length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'update-permissions', JSON.parse(JSON.stringify(manifestDiff))));
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];
      const manifestDiff: S3StorageManifestDiff = {};

      for (const permission of this.properties.permissions) {
        if (permission.remoteDirectoryPath in manifestDiff) {
          manifestDiff[permission.remoteDirectoryPath][permission.principalResourceId] = 'addDirectoryPermissions';
        } else {
          manifestDiff[permission.remoteDirectoryPath] = {
            [permission.principalResourceId]: 'addDirectoryPermissions',
          };
        }
      }

      if (Object.keys(manifestDiff).length > 0) {
        diffs.push(new Diff(this, DiffAction.UPDATE, 'update-permissions', JSON.parse(JSON.stringify(manifestDiff))));
      }

      return diffs;
    } else {
      return [diff];
    }
  }
}
