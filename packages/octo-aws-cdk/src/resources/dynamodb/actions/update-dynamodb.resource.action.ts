import {
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
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
export class UpdateDynamoDbResourceAction implements IResourceAction<DynamoDb> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof DynamoDb &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'properties' &&
      (diff.value.key === 'billingMode' ||
        diff.value.key === 'provisionedThroughput' ||
        diff.value.key === 'streamSpecification' ||
        diff.value.key === 'ttl')
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

    // Apply current billing, provisioning, and stream configuration in a single UpdateTable call.
    await dynamodbClient.send(
      new UpdateTableCommand({
        BillingMode: properties.billingMode,
        ProvisionedThroughput:
          properties.billingMode === 'PROVISIONED' ? properties.provisionedThroughput : undefined,
        StreamSpecification: properties.streamSpecification,
        TableName: properties.tableName,
      }),
    );

    // Handle TTL — requires a separate API call.
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

    // Fetch the updated stream ARN when streams are enabled.
    if (properties.streamSpecification?.StreamEnabled) {
      const { Table } = await dynamodbClient.send(
        new DescribeTableCommand({ TableName: properties.tableName }),
      );
      return {
        ...response,
        LatestStreamArn: Table?.LatestStreamArn,
        LatestStreamLabel: Table?.LatestStreamLabel,
      };
    }

    // Clear stream fields if streams are explicitly disabled.
    if (properties.streamSpecification && !properties.streamSpecification.StreamEnabled) {
      return { ...response, LatestStreamArn: undefined, LatestStreamLabel: undefined };
    }

    return { ...response };
  }

  async mock(
    diff: Diff<DynamoDb>,
    capture: Partial<DynamoDbSchema['response']>,
  ): Promise<DynamoDbSchema['response']> {
    const table = diff.node;
    const properties = table.properties;
    const response = table.response;

    if (properties.streamSpecification?.StreamEnabled) {
      return {
        ...response,
        LatestStreamArn: capture.LatestStreamArn,
        LatestStreamLabel: capture.LatestStreamLabel,
      };
    }

    if (properties.streamSpecification && !properties.streamSpecification.StreamEnabled) {
      return { ...response, LatestStreamArn: undefined, LatestStreamLabel: undefined };
    }

    return { ...response, ...capture };
  }
}

/**
 * @internal
 */
@Factory<UpdateDynamoDbResourceAction>(UpdateDynamoDbResourceAction)
export class UpdateDynamoDbResourceActionFactory {
  private static instance: UpdateDynamoDbResourceAction;

  static async create(): Promise<UpdateDynamoDbResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateDynamoDbResourceAction(container);
    }
    return this.instance;
  }
}
