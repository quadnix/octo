import { DescribeTableCommand, DynamoDBClient, TagResourceCommand, UpdateTableCommand } from '@aws-sdk/client-dynamodb';
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
import { DynamoDBGlobal, type DynamoDBGlobalDiff } from '../dynamodb-global.resource.js';
import type { DynamoDBGlobalSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDBGlobal)
export class UpdateDynamoDBGlobalResourceAction extends ANodeAction implements IResourceAction<DynamoDBGlobal> {
  actionTimeoutInMs: number = 1800000; // 30 minutes. Replica updates depends on table size being replicated.

  constructor() {
    super();
  }

  filter(diff: Diff<any, DiffValueTypePropertyUpdate>): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof DynamoDBGlobal &&
      hasNodeName(diff.node, 'dynamodb-global') &&
      diff.field === 'properties'
    );
  }

  async handle(diff: Diff<DynamoDBGlobal, DynamoDBGlobalDiff>): Promise<DynamoDBGlobalSchema['response']> {
    const dynamoDBGlobal = diff.node;
    const properties = dynamoDBGlobal.properties;
    const diffValue = diff.value;

    // Get parent properties.
    const [matchingDynamoDB] = dynamoDBGlobal.parents;
    const parentDynamoDB = matchingDynamoDB.getSchemaInstanceInResourceAction();
    const parentDynamoDBAccountId = parentDynamoDB.properties.awsAccountId;
    const parentDynamoDBRegionId = parentDynamoDB.properties.awsRegionId;
    const tableName = parentDynamoDB.properties.TableName;
    const tableArn = parentDynamoDB.response.TableArn;

    // Get all DynamoDB client for primary + replica regions.
    const replicaKeys = new Set<string>();
    replicaKeys.add(`${parentDynamoDBAccountId}:${parentDynamoDBRegionId}`);
    for (const r of properties.replicas) {
      replicaKeys.add(`${r.awsAccountId}:${r.awsRegionId}`);
    }
    const clientsMap: Record<string, DynamoDBClient> = {};
    for (const key of replicaKeys) {
      const [awsAccountId, awsRegionId] = key.split(':');
      clientsMap[key] = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
        args: [awsAccountId, awsRegionId],
        metadata: { package: '@octo' },
      });
    }
    const primaryClient = clientsMap[`${parentDynamoDBAccountId}:${parentDynamoDBRegionId}`];

    // Update DynamoDB table with replicas.
    for (const replicaDiff of diffValue.replicaDiffs) {
      const replicaUpdate =
        replicaDiff.action === 'add'
          ? { Create: { RegionName: replicaDiff.properties.awsRegionId } }
          : { Delete: { RegionName: replicaDiff.properties.awsRegionId } };
      await primaryClient.send(
        new UpdateTableCommand({
          ReplicaUpdates: [replicaUpdate],
          TableName: tableName,
        }),
      );

      // Wait for DynamoDB table to be ACTIVE again.
      this.log('Waiting for DynamoDB table to be ACTIVE again.');
      await RetryUtility.retryPromise(
        async (): Promise<boolean> => {
          const { Table } = await primaryClient.send(new DescribeTableCommand({ TableName: tableName }));
          return Table?.TableStatus === 'ACTIVE';
        },
        {
          initialDelayInMs: 5000,
          maxRetries: 30,
          retryDelayInMs: 10000,
          throwOnError: true,
        },
      );
    }

    // Update DynamoDB table replica tags.
    for (const tagUpdate of diffValue.tagUpdates) {
      if (Object.keys(tagUpdate.tags).length > 0) {
        const client = clientsMap[`${tagUpdate.awsAccountId}:${tagUpdate.awsRegionId}`];
        await client.send(
          new TagResourceCommand({
            ResourceArn: tableArn,
            Tags: Object.entries(tagUpdate.tags).map(([Key, Value]) => ({ Key, Value })),
          }),
        );
      }
    }

    // Set response.
    const response: DynamoDBGlobalSchema['response'] = {};
    for (const key of replicaKeys) {
      const client = clientsMap[key];
      const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
      response[key] = {
        LatestStreamArn: Table!.LatestStreamArn!,
        TableArn: Table!.TableArn!,
        TableId: Table!.TableId!,
      };
    }
    return response;
  }

  async mock(
    diff: Diff<DynamoDBGlobal>,
    capture: Partial<DynamoDBGlobalSchema['response']>,
  ): Promise<DynamoDBGlobalSchema['response']> {
    const dynamoDBGlobal = diff.node;
    const response = dynamoDBGlobal.response;

    for (const [accountRegion, replicaResponse] of Object.entries(capture || {})) {
      response[accountRegion] = {
        LatestStreamArn: replicaResponse?.LatestStreamArn || response[accountRegion].LatestStreamArn,
        TableArn: replicaResponse?.TableArn || response[accountRegion].TableArn,
        TableId: replicaResponse?.TableId || response[accountRegion].TableId,
      };
    }

    return response;
  }
}

/**
 * @internal
 */
@Factory<UpdateDynamoDBGlobalResourceAction>(UpdateDynamoDBGlobalResourceAction)
export class UpdateDynamoDBGlobalResourceActionFactory {
  private static instance: UpdateDynamoDBGlobalResourceAction;

  static async create(): Promise<UpdateDynamoDBGlobalResourceAction> {
    if (!this.instance) {
      this.instance = new UpdateDynamoDBGlobalResourceAction();
    }
    return this.instance;
  }
}
