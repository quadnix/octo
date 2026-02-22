import { DeleteTableCommand, DynamoDBClient, waitUntilTableNotExists } from '@aws-sdk/client-dynamodb';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDB } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class DeleteDynamoDBResourceAction extends ANodeAction implements IResourceAction<DynamoDB> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof DynamoDB &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDB>): Promise<void> {
    // Get properties.
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;

    // Get instances.
    const dynamoDBClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete DynamoDB table.
    await dynamoDBClient.send(new DeleteTableCommand({ TableName: properties.TableName }));

    // Wait for DynamoDB table to be deleted.
    this.log('Waiting for DynamoDB Table to be deleted.');
    await waitUntilTableNotExists({ client: dynamoDBClient, maxWaitTime: 600 }, { TableName: properties.TableName });
  }
}

/**
 * @internal
 */
@Factory<DeleteDynamoDBResourceAction>(DeleteDynamoDBResourceAction)
export class DeleteDynamoDBResourceActionFactory {
  private static instance: DeleteDynamoDBResourceAction;

  static async create(): Promise<DeleteDynamoDBResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteDynamoDBResourceAction();
    }
    return this.instance;
  }
}
