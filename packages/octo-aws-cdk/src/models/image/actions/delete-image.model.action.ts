import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  Image,
  ModelType,
} from '@quadnix/octo';

@Action(ModelType.MODEL)
export class DeleteImageModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteImageModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof Image &&
      diff.model.MODEL_NAME === 'image' &&
      diff.field === 'imageId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    // We currently do not attempt to delete local docker image.

    return actionOutputs;
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
