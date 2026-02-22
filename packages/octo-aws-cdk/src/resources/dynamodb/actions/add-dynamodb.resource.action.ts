import {
  CreateTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDB } from '../dynamodb.resource.js';
import type { DynamoDBSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class AddDynamoDBResourceAction extends ANodeAction implements IResourceAction<DynamoDB> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof DynamoDB &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDB>): Promise<DynamoDBSchema['response']> {
    // Get properties.
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;
    const tags = dynamoDB.tags;

    // Get instances.
    const dynamoDBClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create DynamoDB table.
    const createTableCommandOutput = await dynamoDBClient.send(
      new CreateTableCommand({
        AttributeDefinitions: properties.AttributeDefinitions,
        BillingMode: properties.billingMode.type,
        DeletionProtectionEnabled: properties.DeletionProtectionEnabled,
        GlobalSecondaryIndexes: properties.GlobalSecondaryIndexes,
        KeySchema: properties.KeySchema,
        LocalSecondaryIndexes: properties.LocalSecondaryIndexes,
        OnDemandThroughput:
          properties.billingMode.type === 'PAY_PER_REQUEST'
            ? properties.billingMode.settings.OnDemandThroughput
            : undefined,
        ProvisionedThroughput:
          properties.billingMode.type === 'PROVISIONED'
            ? properties.billingMode.settings.ProvisionedThroughput
            : undefined,
        StreamSpecification: properties.StreamSpecification
          ? { StreamEnabled: true, StreamViewType: properties.StreamSpecification.StreamViewType }
          : undefined,
        TableClass: properties.TableClass,
        TableName: properties.TableName,
        Tags: Object.keys(tags).length > 0 ? Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) : undefined,
        WarmThroughput:
          properties.billingMode.type === 'PAY_PER_REQUEST'
            ? properties.billingMode.settings.WarmThroughput
            : undefined,
      }),
    );

    // Wait for DynamoDB table to exist.
    this.log('Waiting for DynamoDB Table to exist.');
    await waitUntilTableExists({ client: dynamoDBClient, maxWaitTime: 600 }, { TableName: properties.TableName });

    // Enable TTL if specified.
    if (properties.timeToLiveAttribute) {
      await dynamoDBClient.send(
        new UpdateTimeToLiveCommand({
          TableName: properties.TableName,
          TimeToLiveSpecification: {
            AttributeName: properties.timeToLiveAttribute,
            Enabled: true,
          },
        }),
      );
    }

    const tableDescription = createTableCommandOutput.TableDescription!;
    return {
      LatestStreamArn: tableDescription.LatestStreamArn,
      TableArn: tableDescription.TableArn!,
      TableId: tableDescription.TableId!,
    };
  }

  async mock(diff: Diff<DynamoDB>, capture: Partial<DynamoDBSchema['response']>): Promise<DynamoDBSchema['response']> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;

    return {
      LatestStreamArn: capture.LatestStreamArn,
      TableArn:
        capture.TableArn ??
        `arn:aws:dynamodb:${properties.awsRegionId}:${properties.awsAccountId}:table/${properties.TableName}`,
      TableId: capture.TableId,
    };
  }
}

/**
 * @internal
 */
@Factory<AddDynamoDBResourceAction>(AddDynamoDBResourceAction)
export class AddDynamoDBResourceActionFactory {
  private static instance: AddDynamoDBResourceAction;

  static async create(): Promise<AddDynamoDBResourceAction> {
    if (!this.instance) {
      this.instance = new AddDynamoDBResourceAction();
    }
    return this.instance;
  }
}
