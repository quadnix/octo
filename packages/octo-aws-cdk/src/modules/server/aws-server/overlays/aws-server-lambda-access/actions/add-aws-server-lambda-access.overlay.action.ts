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
import { AwsServerLambdaAccessOverlay } from '../aws-server-lambda-access.overlay.js';

/**
 * A grant creates nothing. The execution running the server grants it to the role it creates.
 *
 * @internal
 */
@Action(AwsServerLambdaAccessOverlay)
export class AddAwsServerLambdaAccessOverlayAction implements IModelAction<AwsServerModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerLambdaAccessOverlay &&
      hasNodeName(diff.node, 'aws-server-lambda-access-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerLambdaAccessOverlay>,
    _actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerLambdaAccessOverlayAction>(AddAwsServerLambdaAccessOverlayAction)
export class AddAwsServerLambdaAccessOverlayActionFactory {
  private static instance: AddAwsServerLambdaAccessOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerLambdaAccessOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerLambdaAccessOverlayAction();
    }
    return this.instance;
  }
}
