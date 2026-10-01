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
import type { AwsServerlessRegionModule } from '../../../aws-serverless-region.module.js';
import { AwsServerlessRegion } from '../aws-serverless-region.model.js';

/**
 * A serverless region creates nothing.
 *
 * @internal
 */
@Action(AwsServerlessRegion)
export class AddAwsServerlessRegionModelAction implements IModelAction<AwsServerlessRegionModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerlessRegion &&
      hasNodeName(diff.node, 'region') &&
      diff.field === 'regionId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerlessRegion>,
    _actionInputs: EnhancedModuleSchema<AwsServerlessRegionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerlessRegionModelAction>(AddAwsServerlessRegionModelAction)
export class AddAwsServerlessRegionModelActionFactory {
  private static instance: AddAwsServerlessRegionModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerlessRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerlessRegionModelAction();
    }
    return this.instance;
  }
}
