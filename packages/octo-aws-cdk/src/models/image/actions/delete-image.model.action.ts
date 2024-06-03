import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionOutputs, Diff, IModelAction } from '@quadnix/octo';

@Action(ModelType.MODEL)
export class DeleteImageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteImageModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  async handle(): Promise<ActionOutputs> {
    // We currently do not attempt to delete local docker image.
    return {};
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteImageModelAction>(DeleteImageModelAction)
export class DeleteImageModelActionFactory {
  static async create(): Promise<DeleteImageModelAction> {
    return new DeleteImageModelAction();
  }
}
