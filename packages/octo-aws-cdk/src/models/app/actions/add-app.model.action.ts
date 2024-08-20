import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  IModelAction,
  NodeType,
} from '@quadnix/octo';

@Action(NodeType.MODEL)
export class AddAppModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddAppModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node.NODE_NAME === 'app';
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddAppModelAction>(AddAppModelAction)
export class AddAppModelActionFactory {
  static async create(): Promise<AddAppModelAction> {
    return new AddAppModelAction();
  }
}
