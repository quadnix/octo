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
import type { AwsLocalstackAccountModule } from '../../../aws-localstack-account.module.js';
import { AwsLocalstackAccount } from '../aws-localstack-account.model.js';

/**
 * @internal
 */
@Action(AwsLocalstackAccount)
export class AddAwsLocalstackAccountModelAction implements IModelAction<AwsLocalstackAccountModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsLocalstackAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsLocalstackAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsLocalstackAccountModelAction>(AddAwsLocalstackAccountModelAction)
export class AddAwsLocalstackAccountModelActionFactory {
  private static instance: AddAwsLocalstackAccountModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsLocalstackAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsLocalstackAccountModelAction();
    }
    return this.instance;
  }
}
