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
import type { AwsServerlessSubnetModule } from '../../../aws-serverless-subnet.module.js';
import { AwsServerlessSubnet } from '../aws-serverless-subnet.model.js';

/**
 * A serverless subnet creates nothing.
 *
 * @internal
 */
@Action(AwsServerlessSubnet)
export class AddAwsServerlessSubnetModelAction implements IModelAction<AwsServerlessSubnetModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerlessSubnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'subnetId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerlessSubnet>,
    _actionInputs: EnhancedModuleSchema<AwsServerlessSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerlessSubnetModelAction>(AddAwsServerlessSubnetModelAction)
export class AddAwsServerlessSubnetModelActionFactory {
  private static instance: AddAwsServerlessSubnetModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerlessSubnetModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerlessSubnetModelAction();
    }
    return this.instance;
  }
}
