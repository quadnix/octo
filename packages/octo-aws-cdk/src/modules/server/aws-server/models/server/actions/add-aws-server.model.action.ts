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
import type { AwsServerModule } from '../../../aws-server.module.js';
import { AwsServer } from '../aws-server.model.js';

/**
 * A server creates nothing. The execution running it creates everything its runtime needs.
 *
 * @internal
 */
@Action(AwsServer)
export class AddAwsServerModelAction implements IModelAction<AwsServerModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServer &&
      hasNodeName(diff.node, 'server') &&
      diff.field === 'serverKey'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff,
    _actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerModelAction>(AddAwsServerModelAction)
export class AddAwsServerModelActionFactory {
  private static instance: AddAwsServerModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerModelAction();
    }
    return this.instance;
  }
}
