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
import { AwsIniAccount } from '../aws.ini-account.model.js';

/**
 * @internal
 */
@Action(AwsIniAccount)
export class AddIniAccountModelAction implements IModelAction<AwsIniAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsIniAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

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
@Factory<AddIniAccountModelAction>(AddIniAccountModelAction)
export class AddIniAccountModelActionFactory {
  private static instance: AddIniAccountModelAction;

  static async create(): Promise<AddIniAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddIniAccountModelAction();
    }
    return this.instance;
  }
}
