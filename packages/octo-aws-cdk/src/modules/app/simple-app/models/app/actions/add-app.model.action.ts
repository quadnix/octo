import {
  Action,
  type ActionOutputs,
  App,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import type { AppModule } from '../../../app.module.js';

/**
 * @internal
 */
@Action(App)
export class AddAppModelAction implements IModelAction<AppModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof App &&
      hasNodeName(diff.node, 'app') &&
      diff.field === 'name'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AppModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
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
