import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * One row of the `accounts` table this template provisions.
 */
export interface AccountItem {
  AccountId: string;
  AccountType: string;
  CreatedAt: number;
  Email: string;
  ExpiresAt: number;
  UserId: string;
}

const TABLE_NAME: string = 'accounts';

/**
 * Reads and writes the `accounts` table, so the e2e can prove the provisioned DynamoDB table is
 * actually usable and not merely present.
 */
export class AccountRepository {
  private readonly documentClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  /**
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    const client = new DynamoDBClient({ endpoint, region });
    this.documentClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        convertClassInstanceToMap: true,
        removeUndefinedValues: true,
      },
    });
    this.tableName = TABLE_NAME;
  }

  /**
   * Deletes the row with the given primary key. Deleting a row that is not there is not an error.
   */
  async delete(accountId: string, accountType: string): Promise<void> {
    await this.documentClient.send(
      new DeleteCommand({
        Key: { AccountId: accountId, AccountType: accountType },
        TableName: this.tableName,
      }),
    );
  }

  /**
   * Returns every row of the account, one per account type, off the table's own key.
   */
  async getByAccountId(accountId: string): Promise<AccountItem[]> {
    const { Items } = await this.documentClient.send(
      new QueryCommand({
        ExpressionAttributeValues: { ':AccountId': accountId },
        KeyConditionExpression: 'AccountId = :AccountId',
        TableName: this.tableName,
      }),
    );
    return (Items as AccountItem[]) || [];
  }

  /**
   * Returns the account's rows created within the inclusive time range, off the `AccountCreatedAtIndex`
   * local secondary index.
   */
  async getByAccountIdAndCreatedAt(accountId: string, startTime: number, endTime: number): Promise<AccountItem[]> {
    const { Items } = await this.documentClient.send(
      new QueryCommand({
        ExpressionAttributeValues: { ':AccountId': accountId, ':endTime': endTime, ':startTime': startTime },
        IndexName: 'AccountCreatedAtIndex',
        KeyConditionExpression: 'AccountId = :AccountId AND CreatedAt BETWEEN :startTime AND :endTime',
        TableName: this.tableName,
      }),
    );
    return (Items as AccountItem[]) || [];
  }

  /**
   * Returns the single row with the given primary key, or `null` when the table holds no such row.
   */
  async getByAccountIdAndType(accountId: string, accountType: string): Promise<AccountItem | null> {
    const { Item } = await this.documentClient.send(
      new GetCommand({
        Key: { AccountId: accountId, AccountType: accountType },
        TableName: this.tableName,
      }),
    );
    return (Item as AccountItem) || null;
  }

  /**
   * Returns the rows carrying the given email, off the `AccountEmailIndex` global secondary index.
   */
  async getByEmail(email: string): Promise<AccountItem[]> {
    const { Items } = await this.documentClient.send(
      new QueryCommand({
        ExpressionAttributeValues: { ':Email': email },
        IndexName: 'AccountEmailIndex',
        KeyConditionExpression: 'Email = :Email',
        TableName: this.tableName,
      }),
    );
    return (Items as AccountItem[]) || [];
  }

  /**
   * Returns the rows belonging to the given user, off the `AccountUserIndex` global secondary index.
   */
  async getByUserId(userId: string): Promise<AccountItem[]> {
    const { Items } = await this.documentClient.send(
      new QueryCommand({
        ExpressionAttributeValues: { ':UserId': userId },
        IndexName: 'AccountUserIndex',
        KeyConditionExpression: 'UserId = :UserId',
        TableName: this.tableName,
      }),
    );
    return (Items as AccountItem[]) || [];
  }

  /**
   * Writes the row, replacing any row that shares its primary key.
   */
  async put(item: AccountItem): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        Item: item,
        TableName: this.tableName,
      }),
    );
  }

  /**
   * Sets the given attributes on the row with the given primary key, leaving its other attributes
   * alone, and creating the row when the table holds none. An empty set of updates writes nothing.
   */
  async update(
    accountId: string,
    accountType: string,
    updates: Partial<Omit<AccountItem, 'AccountId' | 'AccountType'>>,
  ): Promise<void> {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;

    const ExpressionAttributeNames: Record<string, string> = {};
    const ExpressionAttributeValues: Record<string, any> = {};

    const updateParts = keys.map((key) => {
      ExpressionAttributeNames[`#${key}`] = key;
      ExpressionAttributeValues[`:${key}`] = (updates as any)[key];
      return `#${key} = :${key}`;
    });

    await this.documentClient.send(
      new UpdateCommand({
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        Key: { AccountId: accountId, AccountType: accountType },
        TableName: this.tableName,
        UpdateExpression: `SET ${updateParts.join(', ')}`,
      }),
    );
  }
}
