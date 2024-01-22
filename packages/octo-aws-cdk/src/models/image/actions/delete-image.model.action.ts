import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { AAction } from '../../action.abstract.js';

@Action(ModelType.MODEL)
export class DeleteImageModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteImageModelAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  async handle(): Promise<ActionOutputs> {
    // We currently do not attempt to delete local docker image.
    return {};
  }
}

@Factory<DeleteImageModelAction>(DeleteImageModelAction)
export class DeleteImageModelActionFactory {
  static async create(): Promise<DeleteImageModelAction> {
    return new DeleteImageModelAction();
  }
}
