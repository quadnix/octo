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
import type { AwsIniAccountModule } from '../../../aws-ini-account.module.js';
import { AwsIniAccount } from '../aws-ini-account.model.js';

/**
 * @internal
 */
@Action(AwsIniAccount)
export class AddAwsIniAccountModelAction implements IModelAction<AwsIniAccountModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsIniAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsIniAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsIniAccountModelAction>(AddAwsIniAccountModelAction)
export class AddAwsIniAccountModelActionFactory {
  private static instance: AddAwsIniAccountModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsIniAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsIniAccountModelAction();
    }
    return this.instance;
  }
}
