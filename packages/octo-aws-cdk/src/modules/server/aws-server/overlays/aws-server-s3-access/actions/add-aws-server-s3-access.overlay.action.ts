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
import { AwsServerS3AccessOverlay } from '../aws-server-s3-access.overlay.js';

/**
 * A grant creates nothing. The execution running the server grants it to the role it creates.
 *
 * @internal
 */
@Action(AwsServerS3AccessOverlay)
export class AddAwsServerS3AccessOverlayAction implements IModelAction<AwsServerModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerS3AccessOverlay &&
      hasNodeName(diff.node, 'aws-server-s3-access-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerS3AccessOverlay>,
    _actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerS3AccessOverlayAction>(AddAwsServerS3AccessOverlayAction)
export class AddAwsServerS3AccessOverlayActionFactory {
  private static instance: AddAwsServerS3AccessOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerS3AccessOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerS3AccessOverlayAction();
    }
    return this.instance;
  }
}
