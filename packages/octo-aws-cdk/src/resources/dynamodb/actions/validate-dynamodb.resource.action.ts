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

    // Validate AttributeDefinitions.
    const actualAttributeDefinitions = actualTable.AttributeDefinitions ?? [];
    if (actualAttributeDefinitions.length !== properties.AttributeDefinitions.length) {
      throw new TransactionError(
        `DynamoDB table AttributeDefinitions length mismatch. Expected: ${properties.AttributeDefinitions.length}, Actual: ${actualAttributeDefinitions.length}`,
      );
    }
    for (const expectedAttribute of properties.AttributeDefinitions) {
      const actualAttr = actualAttributeDefinitions.find((a) => a.AttributeName === expectedAttribute.AttributeName);
      if (!actualAttr) {
        throw new TransactionError(
          `DynamoDB table AttributeDefinitions attribute "${expectedAttribute.AttributeName}" not found`,
        );
      }
      if (actualAttr.AttributeType !== expectedAttribute.AttributeType) {
        throw new TransactionError(
          `DynamoDB table AttributeDefinitions AttributeType mismatch for "${expectedAttribute.AttributeName}". Expected: ${expectedAttribute.AttributeType}, Actual: ${actualAttr.AttributeType}`,
        );
      }
    }

    // Validate billing mode (DynamoDB defaults to PROVISIONED if BillingModeSummary is absent).
    const actualBillingMode = actualTable.BillingModeSummary?.BillingMode ?? 'PROVISIONED';
    if (actualBillingMode !== properties.billingMode.type) {
      throw new TransactionError(
        `DynamoDB table billing mode mismatch. Expected: ${properties.billingMode.type}, Actual: ${actualBillingMode}`,
      );
    }

    // Validate DeletionProtectionEnabled.
    if (actualTable.DeletionProtectionEnabled !== properties.DeletionProtectionEnabled) {
      throw new TransactionError(
        `DynamoDB table DeletionProtectionEnabled mismatch. Expected: ${properties.DeletionProtectionEnabled}, Actual: ${actualTable.DeletionProtectionEnabled}`,
      );
    }

    // Validate GlobalSecondaryIndexes.
    const actualGSIs = actualTable.GlobalSecondaryIndexes ?? [];
    if (actualGSIs.length !== properties.GlobalSecondaryIndexes.length) {
      throw new TransactionError(
        `DynamoDB table GlobalSecondaryIndexes length mismatch. Expected: ${properties.GlobalSecondaryIndexes.length}, Actual: ${actualGSIs.length}`,
      );
    }
    for (const expectedGSI of properties.GlobalSecondaryIndexes) {
      const actualGSI = actualGSIs.find((g) => g.IndexName === expectedGSI.IndexName);
      if (!actualGSI) {
        throw new TransactionError(`DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" not found`);
      }
      if (actualGSI.IndexStatus !== 'ACTIVE') {
        throw new TransactionError(
          `DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" is not ACTIVE. Actual: ${actualGSI.IndexStatus}`,
        );
      }
      const actualGSIKeySchema = actualGSI.KeySchema ?? [];
      if (actualGSIKeySchema.length !== expectedGSI.KeySchema.length) {
        throw new TransactionError(
          `DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" key schema length mismatch. Expected: ${expectedGSI.KeySchema.length}, Actual: ${actualGSIKeySchema.length}`,
        );
      }
      for (const expectedKey of expectedGSI.KeySchema) {
        const actualKey = actualGSIKeySchema.find((k) => k.AttributeName === expectedKey.AttributeName);
        if (!actualKey) {
          throw new TransactionError(
            `DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" key schema attribute "${expectedKey.AttributeName}" not found`,
          );
        }
        if (actualKey.KeyType !== expectedKey.KeyType) {
          throw new TransactionError(
            `DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" key schema KeyType mismatch for "${expectedKey.AttributeName}". Expected: ${expectedKey.KeyType}, Actual: ${actualKey.KeyType}`,
          );
        }
      }
      if (actualGSI.Projection?.ProjectionType !== expectedGSI.Projection.ProjectionType) {
        throw new TransactionError(
          `DynamoDB table GlobalSecondaryIndex "${expectedGSI.IndexName}" projection type mismatch. Expected: ${expectedGSI.Projection.ProjectionType}, Actual: ${actualGSI.Projection?.ProjectionType}`,
        );
      }
    }

    // Validate key schema.
    const actualKeySchema = actualTable.KeySchema ?? [];
    if (actualKeySchema.length !== properties.KeySchema.length) {
      throw new TransactionError(
        `DynamoDB table key schema length mismatch. Expected: ${properties.KeySchema.length}, Actual: ${actualKeySchema.length}`,
      );
    }
    for (const expectedKey of properties.KeySchema) {
      const actualKey = actualKeySchema.find((k) => k.AttributeName === expectedKey.AttributeName);
      if (!actualKey) {
        throw new TransactionError(
          `DynamoDB table key schema attribute "${expectedKey.AttributeName}" not found in actual key schema`,
        );
      }
      if (actualKey.KeyType !== expectedKey.KeyType) {
        throw new TransactionError(
          `DynamoDB table key schema KeyType mismatch for "${expectedKey.AttributeName}". Expected: ${expectedKey.KeyType}, Actual: ${actualKey.KeyType}`,
        );
      }
    }

    // Validate LocalSecondaryIndexes.
    const actualLSIs = actualTable.LocalSecondaryIndexes ?? [];
    if (actualLSIs.length !== properties.LocalSecondaryIndexes.length) {
      throw new TransactionError(
        `DynamoDB table LocalSecondaryIndexes length mismatch. Expected: ${properties.LocalSecondaryIndexes.length}, Actual: ${actualLSIs.length}`,
      );
    }
    for (const expectedLSI of properties.LocalSecondaryIndexes) {
      const actualLSI = actualLSIs.find((l) => l.IndexName === expectedLSI.IndexName);
      if (!actualLSI) {
        throw new TransactionError(`DynamoDB table LocalSecondaryIndex "${expectedLSI.IndexName}" not found`);
      }
      const actualLSIKeySchema = actualLSI.KeySchema ?? [];
      if (actualLSIKeySchema.length !== expectedLSI.KeySchema.length) {
        throw new TransactionError(
          `DynamoDB table LocalSecondaryIndex "${expectedLSI.IndexName}" key schema length mismatch. Expected: ${expectedLSI.KeySchema.length}, Actual: ${actualLSIKeySchema.length}`,
        );
      }
      for (const expectedKey of expectedLSI.KeySchema) {
        const actualKey = actualLSIKeySchema.find((k) => k.AttributeName === expectedKey.AttributeName);
        if (!actualKey) {
          throw new TransactionError(
            `DynamoDB table LocalSecondaryIndex "${expectedLSI.IndexName}" key schema attribute "${expectedKey.AttributeName}" not found`,
          );
        }
        if (actualKey.KeyType !== expectedKey.KeyType) {
          throw new TransactionError(
            `DynamoDB table LocalSecondaryIndex "${expectedLSI.IndexName}" key schema KeyType mismatch for "${expectedKey.AttributeName}". Expected: ${expectedKey.KeyType}, Actual: ${actualKey.KeyType}`,
          );
        }
      }
      if (actualLSI.Projection?.ProjectionType !== expectedLSI.Projection.ProjectionType) {
        throw new TransactionError(
          `DynamoDB table LocalSecondaryIndex "${expectedLSI.IndexName}" projection type mismatch. Expected: ${expectedLSI.Projection.ProjectionType}, Actual: ${actualLSI.Projection?.ProjectionType}`,
        );
      }
    }

    // Validate DynamoDB latest stream ARN (only present when StreamSpecification is configured).
    if (properties.StreamSpecification) {
      if (actualTable.LatestStreamArn !== response.LatestStreamArn) {
        throw new TransactionError(
          `DynamoDB table LatestStreamArn mismatch. Expected: ${response.LatestStreamArn}, Actual: ${actualTable.LatestStreamArn}`,
        );
      }
    }

    // Validate StreamSpecification (treat absent/disabled stream as undefined).
    const actualStreamViewType = actualTable.StreamSpecification?.StreamEnabled
      ? actualTable.StreamSpecification.StreamViewType
      : undefined;
    const expectedStreamViewType = properties.StreamSpecification?.StreamViewType;
    if (actualStreamViewType !== expectedStreamViewType) {
      throw new TransactionError(
        `DynamoDB table StreamSpecification StreamViewType mismatch. Expected: ${expectedStreamViewType ?? 'disabled'}, Actual: ${actualStreamViewType ?? 'disabled'}`,
      );
    }

    // Validate TableClass (AWS omits TableClassSummary when class is STANDARD).
    const actualTableClass = actualTable.TableClassSummary?.TableClass ?? 'STANDARD';
    if (actualTableClass !== properties.TableClass) {
      throw new TransactionError(
        `DynamoDB table TableClass mismatch. Expected: ${properties.TableClass}, Actual: ${actualTableClass}`,
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
