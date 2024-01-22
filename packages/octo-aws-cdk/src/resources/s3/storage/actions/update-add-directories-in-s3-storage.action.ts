import { Action, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';

@Action(ModelType.RESOURCE)
export class UpdateAddDirectoriesInS3StorageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateAddDirectoriesInS3StorageAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE && diff.model.MODEL_NAME === 's3-storage' && diff.field === 'add-directories'
    );
  }

  async handle(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}

@Factory<UpdateAddDirectoriesInS3StorageAction>(UpdateAddDirectoriesInS3StorageAction)
export class UpdateAddDirectoriesInS3StorageActionFactory {
  static async create(): Promise<UpdateAddDirectoriesInS3StorageAction> {
    return new UpdateAddDirectoriesInS3StorageAction();
  }
}
