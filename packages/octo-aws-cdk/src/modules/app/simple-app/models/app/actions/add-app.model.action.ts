import { Action, type ActionOutputs, App, type Diff, DiffAction, Factory, type IModelAction } from '@quadnix/octo';
import type { AppModule, AppModuleSchema } from '../../../app.module.js';

@Action(App)
export class AddAppModelAction implements IModelAction<AppModule> {
  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && (diff.node.constructor as typeof App).NODE_NAME === 'app';
  }

  async handle(_diff: Diff, _actionInputs: AppModuleSchema, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddAppModelAction>(AddAppModelAction)
export class AddAppModelActionFactory {
  private static instance: AddAppModelAction;

  static async create(): Promise<AddAppModelAction> {
    if (!this.instance) {
      this.instance = new AddAppModelAction();
    }
    return this.instance;
  }
}
