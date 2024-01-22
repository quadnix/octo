import { AResource, Diff, DiffAction, IResource, Resource } from '@quadnix/octo';
import { IS3StorageProperties } from './s3-storage.interface.js';

@Resource()
export class S3Storage extends AResource<S3Storage> {
  readonly MODEL_NAME: string = 's3-storage';

  private readonly directoriesToAdd: {
    directoryReadAnchorName: string;
    directoryWriteAnchorName: string;
    remoteDirectoryPath: string;
  }[] = [];

  private readonly directoriesToRemove: {
    directoryReadAnchorName: string;
    directoryWriteAnchorName: string;
    remoteDirectoryPath: string;
  }[] = [];

  constructor(resourceId: string, properties: IS3StorageProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  addDirectory(directory: S3Storage['directoriesToAdd'][0]): void {
    if (this.directoriesToRemove.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
      throw new Error('Attempting to add a directory marked for deletion!');
    }

    if (!this.directoriesToAdd.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
      this.directoriesToAdd.push({ ...directory });
    }
  }

  override async diff(previous?: S3Storage): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    if (this.directoriesToAdd.length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'add-directories', this.directoriesToAdd));
    }
    if (this.directoriesToRemove.length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'delete-directories', this.directoriesToRemove));
    }

    return diffs;
  }

  removeDirectory(directory: S3Storage['directoriesToRemove'][0]): void {
    if (this.directoriesToAdd.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
      throw new Error('Attempting to delete a directory marked for addition!');
    }

    if (!this.directoriesToRemove.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
      this.directoriesToRemove.push({ ...directory });
    }
  }
}
