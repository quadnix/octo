import { DeleteTableCommand, DynamoDBClient, waitUntilTableNotExists } from '@aws-sdk/client-dynamodb';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDb } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDb)
export class DeleteDynamoDbResourceAction implements IResourceAction<DynamoDb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof DynamoDb &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDb>): Promise<void> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;

    // Get instances.
    const dynamodbClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete table.
    await dynamodbClient.send(new DeleteTableCommand({ TableName: properties.tableName }));

    // Wait for table to be fully deleted.
    await waitUntilTableNotExists(
      { client: dynamodbClient, maxWaitTime: 600 },
      { TableName: properties.tableName },
    );
  }
}

/**
 * @internal
 */
@Factory<DeleteDynamoDbResourceAction>(DeleteDynamoDbResourceAction)
export class DeleteDynamoDbResourceActionFactory {
  private static instance: DeleteDynamoDbResourceAction;

  static async create(): Promise<DeleteDynamoDbResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteDynamoDbResourceAction(container);
    }
    return this.instance;
  }
}
