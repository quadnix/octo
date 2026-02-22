import {
  Action,
  Container,
  type Diff,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
} from '@quadnix/octo';
import { GenericResourceTaggingAction } from '../../../utilities/actions/generic-resource-tagging.action.js';
import { DynamoDB } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class UpdateDynamoDBTagsResourceAction
  extends GenericResourceTaggingAction
  implements IResourceAction<DynamoDB>
{
  constructor(container: Container) {
    super(container);
  }

  override filter(diff: Diff): boolean {
    return super.filter(diff);
  }

  override async handle(diff: Diff<DynamoDB, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;
    const response = dynamoDB.response;

    await super.handle(diff, { ...properties, resourceArn: response.TableArn! });
  }
}

/**
 * @internal
 */
@Factory<UpdateDynamoDBTagsResourceAction>(UpdateDynamoDBTagsResourceAction)
export class UpdateDynamoDBTagsResourceActionFactory {
  private static instance: UpdateDynamoDBTagsResourceAction;

  static async create(): Promise<UpdateDynamoDBTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateDynamoDBTagsResourceAction(container);
    }
    return this.instance;
  }
}
