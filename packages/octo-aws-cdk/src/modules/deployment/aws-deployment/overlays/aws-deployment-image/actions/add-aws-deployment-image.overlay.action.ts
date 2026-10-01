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
import type { AwsDeploymentModule } from '../../../aws-deployment.module.js';
import { AwsDeploymentImageOverlay } from '../aws-deployment-image.overlay.js';

/**
 * A link to an image creates nothing. The execution running the deployment finds the image through it.
 *
 * @internal
 */
@Action(AwsDeploymentImageOverlay)
export class AddAwsDeploymentImageOverlayAction implements IModelAction<AwsDeploymentModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDeploymentImageOverlay &&
      hasNodeName(diff.node, 'aws-deployment-image-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsDeploymentImageOverlay>,
    _actionInputs: EnhancedModuleSchema<AwsDeploymentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsDeploymentImageOverlayAction>(AddAwsDeploymentImageOverlayAction)
export class AddAwsDeploymentImageOverlayActionFactory {
  private static instance: AddAwsDeploymentImageOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsDeploymentImageOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsDeploymentImageOverlayAction();
    }
    return this.instance;
  }
}
