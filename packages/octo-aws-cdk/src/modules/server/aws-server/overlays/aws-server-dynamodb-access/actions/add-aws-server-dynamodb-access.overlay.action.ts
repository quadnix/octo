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
import { AwsServerDynamoDBAccessOverlay } from '../aws-server-dynamodb-access.overlay.js';

/**
 * A grant creates nothing. The execution running the server grants it to the role it creates.
 *
 * @internal
 */
@Action(AwsServerDynamoDBAccessOverlay)
export class AddAwsServerDynamoDBAccessOverlayAction implements IModelAction<AwsServerModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerDynamoDBAccessOverlay &&
      hasNodeName(diff.node, 'aws-server-dynamodb-access-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    _diff: Diff<AwsServerDynamoDBAccessOverlay>,
    _actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsServerDynamoDBAccessOverlayAction>(AddAwsServerDynamoDBAccessOverlayAction)
export class AddAwsServerDynamoDBAccessOverlayActionFactory {
  private static instance: AddAwsServerDynamoDBAccessOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsServerDynamoDBAccessOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerDynamoDBAccessOverlayAction();
    }
    return this.instance;
  }
}
