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
import type { SimpleAppModule } from '../../../simple-app.module.js';

/**
 * @internal
 */
@Action(App)
export class AddSimpleAppModelAction implements IModelAction<SimpleAppModule> {
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
    _actionInputs: EnhancedModuleSchema<SimpleAppModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddSimpleAppModelAction>(AddSimpleAppModelAction)
export class AddSimpleAppModelActionFactory {
  private static instance: AddSimpleAppModelAction;

  static async create(): Promise<AddSimpleAppModelAction> {
    if (!this.instance) {
      this.instance = new AddSimpleAppModelAction();
    }
    return this.instance;
  }
}
