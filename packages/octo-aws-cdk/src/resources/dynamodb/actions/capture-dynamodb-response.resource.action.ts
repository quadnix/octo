import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDB } from '../dynamodb.resource.js';
import type { DynamoDBSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class CaptureDynamoDBResponseResourceAction implements IResourceAction<DynamoDB> {
  filter(diff: Diff): boolean {
    return diff.node instanceof DynamoDB && hasNodeName(diff.node, 'dynamodb');
  }

  async handle(_diff: Diff<DynamoDB>): Promise<void> {}

  async mock(_diff: Diff<DynamoDB>, capture: Partial<DynamoDBSchema['response']>): Promise<DynamoDBSchema['response']> {
    return {
      TableArn: capture.TableArn,
    };
  }
}

@Factory<CaptureDynamoDBResponseResourceAction>(CaptureDynamoDBResponseResourceAction)
export class CaptureDynamoDBResponseResourceActionFactory {
  private static instance: CaptureDynamoDBResponseResourceAction;

  static async create(): Promise<CaptureDynamoDBResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureDynamoDBResponseResourceAction();
    }
    return this.instance;
  }
}
