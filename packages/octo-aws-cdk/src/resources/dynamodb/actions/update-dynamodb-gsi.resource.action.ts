import {
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  type DiffValueTypePropertyUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDb } from '../dynamodb.resource.js';
import type { DynamoDbSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDb)
export class UpdateDynamoDbGsiResourceAction implements IResourceAction<DynamoDb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof DynamoDb &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'properties' &&
      (diff.value.key === 'globalSecondaryIndexes' || diff.value.key === 'attributeDefinitions')
    );
  }

  async handle(diff: Diff<DynamoDb>): Promise<DynamoDbSchema['response']> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;
    const response = table.response;

    // Get instances.
    const dynamodbClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Describe current table to determine actual GSI state in AWS.
    const describeOutput = await dynamodbClient.send(
      new DescribeTableCommand({ TableName: properties.tableName }),
    );
    const currentGsiNames = new Set(
      (describeOutput.Table?.GlobalSecondaryIndexes ?? []).map((gsi) => gsi.IndexName!),
    );
    const desiredGsiNames = new Set((properties.globalSecondaryIndexes ?? []).map((gsi) => gsi.IndexName));

    const gsisToDelete = [...currentGsiNames].filter((name) => !desiredGsiNames.has(name));
    const gsisToAdd = (properties.globalSecondaryIndexes ?? []).filter(
      (gsi) => !currentGsiNames.has(gsi.IndexName),
    );

    // Both diffs (attributeDefinitions + globalSecondaryIndexes) trigger this action.
    // The second invocation finds nothing to do and exits early.
    if (gsisToDelete.length === 0 && gsisToAdd.length === 0) {
      return { ...response };
    }

    // Delete GSIs — multiple deletions are allowed in a single UpdateTable call.
    if (gsisToDelete.length > 0) {
      await dynamodbClient.send(
        new UpdateTableCommand({
          GlobalSecondaryIndexUpdates: gsisToDelete.map((IndexName) => ({ Delete: { IndexName } })),
          TableName: properties.tableName,
        }),
      );
      await this.waitForTableAndGsiActive(dynamodbClient, properties.tableName);
    }

    // Add GSIs one at a time — DynamoDB only allows one Create per UpdateTable call.
    for (const gsi of gsisToAdd) {
      await dynamodbClient.send(
        new UpdateTableCommand({
          AttributeDefinitions: properties.attributeDefinitions,
          GlobalSecondaryIndexUpdates: [
            {
              Create: {
                IndexName: gsi.IndexName,
                KeySchema: gsi.KeySchema,
                Projection: gsi.Projection,
                ProvisionedThroughput:
                  properties.billingMode === 'PROVISIONED' ? gsi.ProvisionedThroughput : undefined,
              },
            },
          ],
          TableName: properties.tableName,
        }),
      );
      await this.waitForTableAndGsiActive(dynamodbClient, properties.tableName);
    }

    return { ...response };
  }

  async mock(
    diff: Diff<DynamoDb>,
    capture: Partial<DynamoDbSchema['response']>,
  ): Promise<DynamoDbSchema['response']> {
    const table = diff.node;
    const response = table.response;

    return { ...response, ...capture };
  }

  private async waitForTableAndGsiActive(
    client: DynamoDBClient,
    tableName: string,
    maxWaitMs = 600_000,
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
      const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const tableActive = Table?.TableStatus === 'ACTIVE';
      const allGsiActive = (Table?.GlobalSecondaryIndexes ?? []).every((gsi) => gsi.IndexStatus === 'ACTIVE');
      if (tableActive && allGsiActive) return;
    }
    throw new Error(`Timed out waiting for DynamoDB table "${tableName}" and all GSIs to become ACTIVE`);
  }
}

/**
 * @internal
 */
@Factory<UpdateDynamoDbGsiResourceAction>(UpdateDynamoDbGsiResourceAction)
export class UpdateDynamoDbGsiResourceActionFactory {
  private static instance: UpdateDynamoDbGsiResourceAction;

  static async create(): Promise<UpdateDynamoDbGsiResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateDynamoDbGsiResourceAction(container);
    }
    return this.instance;
  }
}
