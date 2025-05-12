import { Action, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { S3Storage } from '../s3-storage.resource.js';

@Action(S3Storage)
export class UpdateParentInS3StorageResourceAction implements IResourceAction<S3Storage> {
  filter(diff: Diff): boolean {
    return (
      (diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE) &&
      diff.node instanceof S3Storage &&
      (diff.node.constructor as typeof S3Storage).NODE_NAME === 's3-storage' &&
      diff.field === 'parent'
    );
  }

  async handle(): Promise<void> {}

  async mock(): Promise<void> {}
}

@Factory<UpdateParentInS3StorageResourceAction>(UpdateParentInS3StorageResourceAction)
export class UpdateParentInS3StorageResourceActionFactory {
  private static instance: UpdateParentInS3StorageResourceAction;

  static async create(): Promise<UpdateParentInS3StorageResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateParentInS3StorageResourceAction();
    }
    return this.instance;
  }
}
