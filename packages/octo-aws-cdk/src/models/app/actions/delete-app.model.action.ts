import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  IModelAction,
  ModelType,
} from '@quadnix/octo';

@Action(ModelType.MODEL)
export class DeleteAppModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteAppModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'app';
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteAppModelAction>(DeleteAppModelAction)
export class DeleteAppModelActionFactory {
  static async create(): Promise<DeleteAppModelAction> {
    return new DeleteAppModelAction();
  }
}
