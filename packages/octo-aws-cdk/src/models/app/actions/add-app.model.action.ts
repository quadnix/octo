import { Action, type ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';

@Action(ModelType.MODEL)
export class AddAppModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddAppModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'app';
  }

  async handle(): Promise<ActionOutputs> {
    return {};
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddAppModelAction>(AddAppModelAction)
export class AddAppModelActionFactory {
  static async create(): Promise<AddAppModelAction> {
    return new AddAppModelAction();
  }
}
