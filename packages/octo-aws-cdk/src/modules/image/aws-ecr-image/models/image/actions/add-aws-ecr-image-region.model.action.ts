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
import type { AwsEcrImageModule } from '../../../aws-ecr-image.module.js';
import { AwsEcrImage } from '../aws-ecr-image.model.js';

/**
 * A link to a region creates nothing. `AddAwsEcrImageModelAction` creates every repository.
 *
 * @internal
 */
@Action(AwsEcrImage)
export class AddAwsEcrImageRegionModelAction implements IModelAction<AwsEcrImageModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcrImage &&
      hasNodeName(diff.node, 'image') &&
      diff.field === 'sibling'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsEcrImage>,
    _actionInputs: EnhancedModuleSchema<AwsEcrImageModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcrImageRegionModelAction>(AddAwsEcrImageRegionModelAction)
export class AddAwsEcrImageRegionModelActionFactory {
  private static instance: AddAwsEcrImageRegionModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsEcrImageRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcrImageRegionModelAction();
    }
    return this.instance;
  }
}
