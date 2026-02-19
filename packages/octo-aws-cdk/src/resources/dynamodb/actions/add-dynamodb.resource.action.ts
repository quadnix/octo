import {
  CreateTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDb } from '../dynamodb.resource.js';
import type { DynamoDbSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDb)
export class AddDynamoDbResourceAction implements IResourceAction<DynamoDb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof DynamoDb &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDb>): Promise<DynamoDbSchema['response']> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;
    const tags = table.tags;

    // Get instances.
    const dynamodbClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create table.
    const createOutput = await dynamodbClient.send(
      new CreateTableCommand({
        AttributeDefinitions: properties.attributeDefinitions,
        BillingMode: properties.billingMode,
        GlobalSecondaryIndexes: properties.globalSecondaryIndexes,
        KeySchema: properties.keySchema,
        LocalSecondaryIndexes: properties.localSecondaryIndexes,
        ProvisionedThroughput:
          properties.billingMode === 'PROVISIONED' ? properties.provisionedThroughput : undefined,
        StreamSpecification: properties.streamSpecification,
        TableName: properties.tableName,
        Tags:
          Object.keys(tags).length > 0
            ? Object.entries(tags).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
      }),
    );

    // Wait for table to become ACTIVE.
    await waitUntilTableExists({ client: dynamodbClient, maxWaitTime: 600 }, { TableName: properties.tableName });

    // Configure TTL if specified.
    if (properties.ttl) {
      await dynamodbClient.send(
        new UpdateTimeToLiveCommand({
          TableName: properties.tableName,
          TimeToLiveSpecification: {
            AttributeName: properties.ttl.AttributeName,
            Enabled: properties.ttl.Enabled,
          },
        }),
      );
    }

    const tableDescription = createOutput.TableDescription!;
    return {
      LatestStreamArn: tableDescription.LatestStreamArn,
      LatestStreamLabel: tableDescription.LatestStreamLabel,
      TableArn: tableDescription.TableArn!,
      TableId: tableDescription.TableId!,
      TableName: tableDescription.TableName!,
      TableStatus: 'ACTIVE',
    };
  }

  async mock(
    diff: Diff<DynamoDb>,
    capture: Partial<DynamoDbSchema['response']>,
  ): Promise<DynamoDbSchema['response']> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;

    return {
      LatestStreamArn: capture.LatestStreamArn,
      LatestStreamLabel: capture.LatestStreamLabel,
      TableArn:
        capture.TableArn ??
        `arn:aws:dynamodb:${properties.awsRegionId}:${properties.awsAccountId}:table/${properties.tableName}`,
      TableId: capture.TableId ?? 'mock-table-id',
      TableName: properties.tableName,
      TableStatus: 'ACTIVE',
    };
  }
}

/**
 * @internal
 */
@Factory<AddDynamoDbResourceAction>(AddDynamoDbResourceAction)
export class AddDynamoDbResourceActionFactory {
  private static instance: AddDynamoDbResourceAction;

  static async create(): Promise<AddDynamoDbResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddDynamoDbResourceAction(container);
    }
    return this.instance;
  }
}
