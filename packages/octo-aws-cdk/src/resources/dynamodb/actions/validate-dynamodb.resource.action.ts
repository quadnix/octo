import { DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
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
import { DynamoDB } from '../dynamodb.resource.js';

/**
 * @internal
 */
@Action(DynamoDB)
export class ValidateDynamoDBResourceAction extends ANodeAction implements IResourceAction<DynamoDB> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof DynamoDB &&
      hasNodeName(diff.node, 'dynamodb') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<DynamoDB>): Promise<void> {
    // Get properties.
    const dynamoDB = diff.node;
    const properties = dynamoDB.properties;
    const response = dynamoDB.response;

    // Get instances.
    const dynamoDBClient = await this.container.get<DynamoDBClient, typeof DynamoDBClientFactory>(DynamoDBClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Verify DynamoDB table exists.
    const describeTableCommandOutput = await dynamoDBClient.send(
      new DescribeTableCommand({ TableName: properties.TableName }),
    );
    if (!describeTableCommandOutput.Table) {
      throw new TransactionError(`DynamoDB table "${properties.TableName}" does not exist!`);
    }

    const actualTable = describeTableCommandOutput.Table;

    // Validate DynamoDB table ARN.
    if (actualTable.TableArn !== response.TableArn) {
      throw new TransactionError(
        `DynamoDB table ARN mismatch. Expected: ${response.TableArn}, Actual: ${actualTable.TableArn}`,
      );
    }

    // Validate DynamoDB table ID.
    if (actualTable.TableId !== response.TableId) {
      throw new TransactionError(
        `DynamoDB table ID mismatch. Expected: ${response.TableId}, Actual: ${actualTable.TableId}`,
      );
    }

    // Validate billing mode (DynamoDB defaults to PROVISIONED if BillingModeSummary is absent).
    const actualBillingMode = actualTable.BillingModeSummary?.BillingMode ?? 'PROVISIONED';
    if (actualBillingMode !== properties.billingMode.type) {
      throw new TransactionError(
        `DynamoDB table billing mode mismatch. Expected: ${properties.billingMode.type}, Actual: ${actualBillingMode}`,
      );
    }

    // Validate key schema length as a basic sanity check.
    const actualKeySchemaLength = (actualTable.KeySchema ?? []).length;
    if (actualKeySchemaLength !== properties.KeySchema.length) {
      throw new TransactionError(
        `DynamoDB table key schema length mismatch. Expected: ${properties.KeySchema.length}, Actual: ${actualKeySchemaLength}`,
      );
    }

    // Validate DynamoDB table name.
    if (actualTable.TableName !== properties.TableName) {
      throw new TransactionError(
        `DynamoDB table name mismatch. Expected: ${properties.TableName}, Actual: ${actualTable.TableName}`,
      );
    }

    // Validate TTL configuration if specified.
    if (properties.timeToLiveAttribute) {
      const describeTimeToLiveCommandOutput = await dynamoDBClient.send(
        new DescribeTimeToLiveCommand({ TableName: properties.TableName }),
      );
      const timeToLiveStatus = describeTimeToLiveCommandOutput.TimeToLiveDescription?.TimeToLiveStatus;
      const timeToLiveAttribute = describeTimeToLiveCommandOutput.TimeToLiveDescription?.AttributeName;
      const timeToLiveEnabled = timeToLiveStatus === 'ENABLED' || timeToLiveStatus === 'ENABLING';

      if (!timeToLiveEnabled) {
        throw new TransactionError(
          `DynamoDB table TTL is not enabled. Expected attribute: ${properties.timeToLiveAttribute}`,
        );
      }
      if (timeToLiveAttribute !== properties.timeToLiveAttribute) {
        throw new TransactionError(
          `DynamoDB table TTL attribute name mismatch. Expected: ${properties.timeToLiveAttribute}, Actual: ${timeToLiveAttribute}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateDynamoDBResourceAction>(ValidateDynamoDBResourceAction)
export class ValidateDynamoDBResourceActionFactory {
  private static instance: ValidateDynamoDBResourceAction;

  static async create(): Promise<ValidateDynamoDBResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateDynamoDBResourceAction();
    }
    return this.instance;
  }
}
