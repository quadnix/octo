import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import type { AwsDynamoDBGlobalServiceModule } from '../../../aws-dynamodb-global-service.module.js';
import { AwsDynamoDBGlobalService } from '../aws-dynamodb-global-service.model.js';

/**
 * Accepts the edge to a replica region. It creates nothing: `AddAwsDynamoDBGlobalServiceModelAction`
 * creates every replica.
 *
 * @internal
 */
@Action(AwsDynamoDBGlobalService)
export class AddAwsDynamoDBGlobalServiceReplicaRegionModelAction
  implements IModelAction<AwsDynamoDBGlobalServiceModule>
{
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDynamoDBGlobalService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'sibling'
    );
  }

  /**
   * @internal
   */
  async handle(): Promise<ActionOutputs> {
    return {};
  }
}

/**
 * @internal
 */
@Factory<AddAwsDynamoDBGlobalServiceReplicaRegionModelAction>(AddAwsDynamoDBGlobalServiceReplicaRegionModelAction)
export class AddAwsDynamoDBGlobalServiceReplicaRegionModelActionFactory {
  private static instance: AddAwsDynamoDBGlobalServiceReplicaRegionModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsDynamoDBGlobalServiceReplicaRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsDynamoDBGlobalServiceReplicaRegionModelAction();
    }
    return this.instance;
  }
}
