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
import type { AwsCredentialsAccountModule } from '../../../aws-credentials-account.module.js';
import { AwsCredentialsAccount } from '../aws.credentials-account.model.js';

/**
 * @internal
 */
@Action(AwsCredentialsAccount)
export class AddCredentialsAccountModelAction implements IModelAction<AwsCredentialsAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCredentialsAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsCredentialsAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddCredentialsAccountModelAction>(AddCredentialsAccountModelAction)
export class AddCredentialsAccountModelActionFactory {
  private static instance: AddCredentialsAccountModelAction;

  static async create(): Promise<AddCredentialsAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddCredentialsAccountModelAction();
    }
    return this.instance;
  }
}
