import { Action, ActionOutputs, Diff, DiffAction, Factory, IModelAction } from '@quadnix/octo';
import { AwsAccountModule, AwsAccountModuleSchema } from '../../../index.js';
import { AwsAccount } from '../aws.account.model.js';

@Action(AwsAccount)
export class AddAccountModelAction implements IModelAction<AwsAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsAccount &&
      (diff.node.constructor as typeof AwsAccount).NODE_NAME === 'account' &&
      diff.field === 'accountId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: AwsAccountModuleSchema,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddAccountModelAction>(AddAccountModelAction)
export class AddAccountModelActionFactory {
  private static instance: AddAccountModelAction;

  static async create(): Promise<AddAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAccountModelAction();
    }
    return this.instance;
  }
}
