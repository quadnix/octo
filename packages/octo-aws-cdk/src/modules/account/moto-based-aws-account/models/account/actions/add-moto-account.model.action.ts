import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { AwsMotoAccountModule } from '../../../aws-moto-account.module.js';
import { AwsMotoAccount } from '../aws.moto-account.model.js';

@Action(AwsMotoAccount)
export class AddMotoAccountModelAction implements IModelAction<AwsMotoAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsMotoAccount &&
      (diff.node.constructor as typeof AwsMotoAccount).NODE_NAME === 'account' &&
      diff.field === 'accountId'
    );
  }

  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsMotoAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<AddMotoAccountModelAction>(AddMotoAccountModelAction)
export class AddMotoAccountModelActionFactory {
  private static instance: AddMotoAccountModelAction;

  static async create(): Promise<AddMotoAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddMotoAccountModelAction();
    }
    return this.instance;
  }
}
