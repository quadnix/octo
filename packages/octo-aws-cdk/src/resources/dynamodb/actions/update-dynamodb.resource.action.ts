import {
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  type DiffValueTypePropertyUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { DynamoDB, type DynamoDBDiff } from '../dynamodb.resource.js';
import type { DynamoDBSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class UpdateDynamoDBResourceAction extends ANodeAction implements IResourceAction<DynamoDB> {
  constructor() {
    super();
  }

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof DynamoDB &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'properties'
    );
  }

  async handle(diff: Diff<DynamoDB, DynamoDBDiff>): Promise<DynamoDBSchema['response']> {
    // Get properties.
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;
    const response = dynamoDB.response;

    const billingModeChanged = diff.value.billingMode;
    const globalIndexesToAdd = diff.value.GlobalSecondaryIndexDiffs.filter((d) => d.action === 'add');
    const globalIndexesToDelete = diff.value.GlobalSecondaryIndexDiffs.filter((d) => d.action === 'delete');
    const StreamSpecificationChanged = diff.value.StreamSpecification;

    // Get instances.
    const dynamoDBClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Apply current billing and stream configuration in a single UpdateTable call.
    await dynamoDBClient.send(
      new UpdateTableCommand({
        AttributeDefinitions: properties.AttributeDefinitions,
        BillingMode: billingModeChanged ? properties.billingMode.type : undefined,
        DeletionProtectionEnabled: properties.DeletionProtectionEnabled,
        GlobalSecondaryIndexUpdates:
          globalIndexesToAdd.length > 0 || globalIndexesToDelete.length > 0
            ? [
                ...(globalIndexesToDelete.length > 0
                  ? globalIndexesToDelete.map((i) => ({
                      Delete: { IndexName: i.properties.IndexName },
                    }))
                  : []),
                ...(globalIndexesToAdd.length > 0
                  ? globalIndexesToAdd.map((i) => ({
                      Create: {
                        IndexName: i.properties.IndexName,
                        KeySchema: i.properties.KeySchema,
                        OnDemandThroughput:
                          properties.billingMode.type === 'PAY_PER_REQUEST'
                            ? properties.billingMode.settings.OnDemandThroughput!
                            : undefined,
                        Projection: i.properties.Projection,
                        ProvisionedThroughput:
                          properties.billingMode.type === 'PROVISIONED'
                            ? properties.billingMode.settings.ProvisionedThroughput!
                            : undefined,
                        WarmThroughput:
                          properties.billingMode.type === 'PAY_PER_REQUEST'
                            ? properties.billingMode.settings.WarmThroughput!
                            : undefined,
                      },
                    }))
                  : []),
              ]
            : undefined,
        OnDemandThroughput:
          billingModeChanged && properties.billingMode.type === 'PAY_PER_REQUEST'
            ? properties.billingMode.settings.OnDemandThroughput!
            : undefined,
        ProvisionedThroughput:
          billingModeChanged && properties.billingMode.type === 'PROVISIONED'
            ? properties.billingMode.settings.ProvisionedThroughput!
            : undefined,
        StreamSpecification: StreamSpecificationChanged
          ? properties.StreamSpecification
            ? { StreamEnabled: true, StreamViewType: properties.StreamSpecification.StreamViewType }
            : { StreamEnabled: false }
          : undefined,
        TableName: properties.TableName,
        WarmThroughput:
          billingModeChanged && properties.billingMode.type === 'PAY_PER_REQUEST'
            ? properties.billingMode.settings.WarmThroughput!
            : undefined,
      }),
    );

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
    } else {
      // timeToLiveAttribute was removed — disable TTL using the attribute name currently in AWS.
      const { TimeToLiveDescription } = await dynamoDBClient.send(
        new DescribeTimeToLiveCommand({ TableName: properties.TableName }),
      );
      if (TimeToLiveDescription?.AttributeName) {
        await dynamoDBClient.send(
          new UpdateTimeToLiveCommand({
            TableName: properties.TableName,
            TimeToLiveSpecification: {
              AttributeName: TimeToLiveDescription.AttributeName,
              Enabled: false,
            },
          }),
        );
      }
    }

    // Wait for DynamoDB table and all GSIs to be ACTIVE.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for DynamoDB table and all GSIs to be ACTIVE.');
        const { Table } = await dynamoDBClient.send(new DescribeTableCommand({ TableName: properties.TableName }));
        const isTableActive = Table?.TableStatus === 'ACTIVE';
        const isAllGSIActive = (Table?.GlobalSecondaryIndexes ?? []).every((i) => i.IndexStatus === 'ACTIVE');
        return isTableActive && isAllGSIActive;
      },
      {
        initialDelayInMs: 5000,
        maxRetries: 6,
        retryDelayInMs: 20000,
        throwOnError: false,
      },
    );

    // Fetch the updated stream ARN when streams are enabled.
    if (properties.StreamSpecification) {
      const { Table } = await dynamoDBClient.send(new DescribeTableCommand({ TableName: properties.TableName }));
      return { ...response, LatestStreamArn: Table?.LatestStreamArn };
    }

    return { ...response, LatestStreamArn: undefined };
  }

  async mock(diff: Diff<DynamoDB>, capture: Partial<DynamoDBSchema['response']>): Promise<DynamoDBSchema['response']> {
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;
    const response = dynamoDB.response;

    if (properties.StreamSpecification) {
      return {
        LatestStreamArn: capture.LatestStreamArn,
        TableArn:
          capture.TableArn ??
          `arn:aws:dynamodb:${properties.awsRegionId}:${properties.awsAccountId}:table/${properties.TableName}`,
        TableId: capture.TableId,
      };
    }

    return {
      LatestStreamArn: undefined,
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
@Factory<UpdateDynamoDBResourceAction>(UpdateDynamoDBResourceAction)
export class UpdateDynamoDBResourceActionFactory {
  private static instance: UpdateDynamoDBResourceAction;

  static async create(): Promise<UpdateDynamoDBResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateDynamoDBResourceAction();
    }
    return this.instance;
  }
}
