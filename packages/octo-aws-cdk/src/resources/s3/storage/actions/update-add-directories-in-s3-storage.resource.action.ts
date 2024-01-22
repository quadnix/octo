import { Action, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';

@Action(ModelType.RESOURCE)
export class UpdateAddDirectoriesInS3StorageResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateAddDirectoriesInS3StorageResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 's3-storage' && diff.field === 'add-directories'
    );
  }

  async handle(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}

@Factory<UpdateAddDirectoriesInS3StorageResourceAction>(UpdateAddDirectoriesInS3StorageResourceAction)
export class UpdateAddDirectoriesInS3StorageResourceActionFactory {
  static async create(): Promise<UpdateAddDirectoriesInS3StorageResourceAction> {
    return new UpdateAddDirectoriesInS3StorageResourceAction();
  }
}
