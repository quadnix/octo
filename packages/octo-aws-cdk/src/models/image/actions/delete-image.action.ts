import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { AAction } from '../../action.abstract.js';

@Action(ModelType.MODEL)
export class DeleteImageAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteImageAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // We currently do not attempt to delete local docker image.
    return {};
  }
}

@Factory<DeleteImageAction>(DeleteImageAction)
export class DeleteImageActionFactory {
  static async create(): Promise<DeleteImageAction> {
    return new DeleteImageAction();
  }
}
