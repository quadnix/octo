import { Action, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';

@Action(ModelType.RESOURCE)
export class UpdateRemoveDirectoriesInS3StorageResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateRemoveDirectoriesInS3StorageResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 's3-storage' && diff.field === 'delete-directories'
    );
  }

  async handle(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}

@Factory<UpdateRemoveDirectoriesInS3StorageResourceAction>(UpdateRemoveDirectoriesInS3StorageResourceAction)
export class UpdateRemoveDirectoriesInS3StorageResourceActionFactory {
  static async create(): Promise<UpdateRemoveDirectoriesInS3StorageResourceAction> {
    return new UpdateRemoveDirectoriesInS3StorageResourceAction();
  }
}
