import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { DynamoDBClientFactory } from '../../../factories/aws-client.factory.js';
import { DynamoDBGlobal } from '../dynamodb-global.resource.js';

/**
 * @internal
 */
@Action(DynamoDBGlobal)
export class ValidateDynamoDBGlobalResourceAction extends ANodeAction implements IResourceAction<DynamoDBGlobal> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof DynamoDBGlobal &&
      hasNodeName(diff.node, 'dynamodb-global') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDBGlobal>): Promise<void> {
    const dynamoDBGlobal = diff.node;
    const properties = dynamoDBGlobal.properties;
    const response = dynamoDBGlobal.response;

    // Get parent properties.
    const [matchingDynamoDB] = dynamoDBGlobal.parents;
    const parentDynamoDB = matchingDynamoDB.getSchemaInstanceInResourceAction();
    const parentDynamoDBAccountId = parentDynamoDB.properties.awsAccountId;
    const parentDynamoDBRegionId = parentDynamoDB.properties.awsRegionId;
    const tableName = parentDynamoDB.properties.TableName;

    // Get all DynamoDB client for replica regions.
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

    for (const key of replicaKeys) {
      const client = clientsMap[key];
      const describeTableCommandOutput = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const table = describeTableCommandOutput.Table;

      if (!table) {
        throw new TransactionError(`DynamoDB global table "${tableName}" does not exist for ${key}`);
      }

      if (table.TableStatus !== 'ACTIVE') {
        throw new TransactionError(
          `DynamoDB global table "${tableName}" in ${key} is not ACTIVE. Actual status: ${table.TableStatus}`,
        );
      }

      const expected = response[key];
      if (expected?.TableArn && table.TableArn !== expected.TableArn) {
        throw new TransactionError(
          `DynamoDB global table ARN mismatch for ${key}. Expected: ${expected.TableArn}, Actual: ${table.TableArn}`,
        );
      }
      if (expected?.TableId && table.TableId !== expected.TableId) {
        throw new TransactionError(
          `DynamoDB global table ID mismatch for ${key}. Expected: ${expected.TableId}, Actual: ${table.TableId}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateDynamoDBGlobalResourceAction>(ValidateDynamoDBGlobalResourceAction)
export class ValidateDynamoDBGlobalResourceActionFactory {
  private static instance: ValidateDynamoDBGlobalResourceAction;

  static async create(): Promise<ValidateDynamoDBGlobalResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateDynamoDBGlobalResourceAction();
    }
    return this.instance;
  }
}
