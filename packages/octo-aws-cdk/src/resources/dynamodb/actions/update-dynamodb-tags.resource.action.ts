import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { DynamoDb } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDb)
export class UpdateDynamoDbTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<DynamoDb>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return (
      super.filter(diff) && diff.node instanceof DynamoDb && hasNodeName(diff.node, 'dynamodb')
    );
  }

  override async handle(diff: Diff<DynamoDb, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;
    const response = table.response;

    await super.handle(diff, { ...properties, resourceArn: response.TableArn! });
  }
}

/**
 * @internal
 */
@Factory<UpdateDynamoDbTagsResourceAction>(UpdateDynamoDbTagsResourceAction)
export class UpdateDynamoDbTagsResourceActionFactory {
  private static instance: UpdateDynamoDbTagsResourceAction;

  static async create(): Promise<UpdateDynamoDbTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateDynamoDbTagsResourceAction(container);
    }
    return this.instance;
  }
}
