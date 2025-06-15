import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { AwsLocalstackAccountModule } from '../../../aws-localstack-account.module.js';
import { AwsLocalstackAccount } from '../aws.localstack-account.model.js';

@Action(AwsLocalstackAccount)
export class AddLocalstackAccountModelAction implements IModelAction<AwsLocalstackAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsLocalstackAccount &&
      (diff.node.constructor as typeof AwsLocalstackAccount).NODE_NAME === 'account' &&
      diff.field === 'accountId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsLocalstackAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddLocalstackAccountModelAction>(AddLocalstackAccountModelAction)
export class AddLocalstackAccountModelActionFactory {
  private static instance: AddLocalstackAccountModelAction;

  static async create(): Promise<AddLocalstackAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddLocalstackAccountModelAction();
    }
    return this.instance;
  }
}
