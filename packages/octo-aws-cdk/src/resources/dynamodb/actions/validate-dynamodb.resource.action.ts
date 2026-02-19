import {
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
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
import { DynamoDb } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDb)
export class ValidateDynamoDbResourceAction extends ANodeAction implements IResourceAction<DynamoDb> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof DynamoDb &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDb>): Promise<void> {
    // Get properties.
    const table = diff.node;
    const properties = table.properties;
    const response = table.response;

    // Get instances.
    const dynamodbClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Verify table exists.
    const describeOutput = await dynamodbClient.send(
      new DescribeTableCommand({ TableName: properties.tableName }),
    );
    if (!describeOutput.Table) {
      throw new TransactionError(`DynamoDB table "${properties.tableName}" does not exist!`);
    }

    const actualTable = describeOutput.Table;

    // Validate table ARN.
    if (actualTable.TableArn !== response.TableArn) {
      throw new TransactionError(
        `DynamoDB table ARN mismatch. Expected: ${response.TableArn}, Actual: ${actualTable.TableArn}`,
      );
    }

    // Validate table ID.
    if (actualTable.TableId !== response.TableId) {
      throw new TransactionError(
        `DynamoDB table ID mismatch. Expected: ${response.TableId}, Actual: ${actualTable.TableId}`,
      );
    }

    // Validate billing mode (DynamoDB defaults to PROVISIONED if BillingModeSummary is absent).
    const actualBillingMode = actualTable.BillingModeSummary?.BillingMode ?? 'PROVISIONED';
    if (actualBillingMode !== properties.billingMode) {
      throw new TransactionError(
        `DynamoDB table billing mode mismatch. Expected: ${properties.billingMode}, Actual: ${actualBillingMode}`,
      );
    }

    // Validate key schema length as a basic sanity check.
    const actualKeySchemaLength = (actualTable.KeySchema ?? []).length;
    if (actualKeySchemaLength !== properties.keySchema.length) {
      throw new TransactionError(
        `DynamoDB table key schema length mismatch. Expected: ${properties.keySchema.length}, Actual: ${actualKeySchemaLength}`,
      );
    }

    // Validate table name.
    if (actualTable.TableName !== properties.tableName) {
      throw new TransactionError(
        `DynamoDB table name mismatch. Expected: ${properties.tableName}, Actual: ${actualTable.TableName}`,
      );
    }

    // Validate TTL configuration if specified.
    if (properties.ttl) {
      const ttlOutput = await dynamodbClient.send(
        new DescribeTimeToLiveCommand({ TableName: properties.tableName }),
      );
      const ttlStatus = ttlOutput.TimeToLiveDescription?.TimeToLiveStatus;
      const ttlAttribute = ttlOutput.TimeToLiveDescription?.AttributeName;
      const ttlEnabled = ttlStatus === 'ENABLED' || ttlStatus === 'ENABLING';

      if (ttlEnabled !== properties.ttl.Enabled) {
        throw new TransactionError(
          `DynamoDB table TTL enabled mismatch. Expected: ${properties.ttl.Enabled}, Actual: ${ttlEnabled}`,
        );
      }
      if (properties.ttl.Enabled && ttlAttribute !== properties.ttl.AttributeName) {
        throw new TransactionError(
          `DynamoDB table TTL attribute name mismatch. Expected: ${properties.ttl.AttributeName}, Actual: ${ttlAttribute}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateDynamoDbResourceAction>(ValidateDynamoDbResourceAction)
export class ValidateDynamoDbResourceActionFactory {
  private static instance: ValidateDynamoDbResourceAction;

  static async create(): Promise<ValidateDynamoDbResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateDynamoDbResourceAction();
    }
    return this.instance;
  }
}
