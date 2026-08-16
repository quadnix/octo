import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import type { AwsMotoAccountModule } from '../../../aws-moto-account.module.js';
import { AwsMotoAccount } from '../aws-moto-account.model.js';

/**
 * @internal
 */
@Action(AwsMotoAccount)
export class AddAwsMotoAccountModelAction implements IModelAction<AwsMotoAccountModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsMotoAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsMotoAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsMotoAccountModelAction>(AddAwsMotoAccountModelAction)
export class AddAwsMotoAccountModelActionFactory {
  private static instance: AddAwsMotoAccountModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsMotoAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsMotoAccountModelAction();
    }
    return this.instance;
  }
}
