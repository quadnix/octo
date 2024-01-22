import { Action, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';

@Action(ModelType.RESOURCE)
export class UpdateRemoveDirectoriesInS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateRemoveDirectoriesInS3StorageAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 's3-storage' && diff.field === 'delete-directories'
    );
  }

  async handle(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}

@Factory<UpdateRemoveDirectoriesInS3StorageAction>(UpdateRemoveDirectoriesInS3StorageAction)
export class UpdateRemoveDirectoriesInS3StorageActionFactory {
  static async create(): Promise<UpdateRemoveDirectoriesInS3StorageAction> {
    return new UpdateRemoveDirectoriesInS3StorageAction();
  }
}
