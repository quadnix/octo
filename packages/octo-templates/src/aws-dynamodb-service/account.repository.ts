import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export interface AccountItem {
  AccountId: string;
  AccountType: string;
  CreatedAt: number;
  Email: string;
  ExpiresAt: number;
  UserId: string;
}

const TABLE_NAME: string = 'accounts';

export class AccountRepository {
  private readonly documentClient: DynamoDBDocumentClient;
  private readonly tableName: string;

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

  async delete(accountId: string, accountType: string): Promise<void> {
    await this.documentClient.send(
      new DeleteCommand({
        Key: { AccountId: accountId, AccountType: accountType },
        TableName: this.tableName,
      }),
    );
  }

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

  async getByAccountIdAndType(accountId: string, accountType: string): Promise<AccountItem | null> {
    const { Item } = await this.documentClient.send(
      new GetCommand({
        Key: { AccountId: accountId, AccountType: accountType },
        TableName: this.tableName,
      }),
    );
    return (Item as AccountItem) || null;
  }

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

  async put(item: AccountItem): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        Item: item,
        TableName: this.tableName,
      }),
    );
  }

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
