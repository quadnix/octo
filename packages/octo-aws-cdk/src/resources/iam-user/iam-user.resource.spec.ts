import { MatchingResource } from '@quadnix/octo';
import { DynamoDB } from '../dynamodb/dynamodb.resource.js';
import type { DynamoDBSchema } from '../dynamodb/index.schema.js';
import type { S3StorageSchema } from '../s3-storage/index.schema.js';
import { S3Storage } from '../s3-storage/s3-storage.resource.js';
import { IamUser } from './iam-user.resource.js';

function createBucket(awsAccountId: string): MatchingResource<S3StorageSchema> {
  const bucket = new S3Storage('bucket-receipts', {
    awsAccountId,
    awsRegionId: 'us-east-1',
    blockPublicAccess: true,
    Bucket: 'receipts',
    lifecycleRules: [],
    permissions: [],
  });
  return new MatchingResource(bucket);
}

function createTable(awsAccountId: string, awsRegionId = 'us-east-1'): MatchingResource<DynamoDBSchema> {
  const table = new DynamoDB('dynamodb-accounts', {
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    awsAccountId,
    awsRegionId,
    billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
    DeletionProtectionEnabled: false,
    GlobalSecondaryIndexes: [],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    LocalSecondaryIndexes: [],
    TableClass: 'STANDARD',
    TableName: 'accounts',
  });
  return new MatchingResource(table);
}

function createIamUser(): IamUser {
  return new IamUser('iam-user-test-user', { awsAccountId: '123456789012', policies: [], username: 'test-user' });
}

/**
 * A stand-in for the terraform module scope, recording what the resource asked to emit rather than
 * serializing it.
 */
function createRecordingScope(): {
  emitted: { name: string; spec: any; type: string }[];
  terraform: any;
} {
  const emitted: { name: string; spec: any; type: string }[] = [];

  const terraform = {
    addOctoTerraformResource: (): unknown => ({
      addTerraformResource: (type: string, name: string, spec: unknown): unknown => {
        emitted.push({ name, spec, type });
        return { address: `${type}.${name}`, attribute: (): void => {} };
      },
      output: (): void => {},
    }),
    jsonencode: (subject: unknown): unknown => subject,
    raw: (value: unknown): unknown => value,
  };

  return { emitted, terraform };
}

describe('IamUser UT', () => {
  describe('addDynamoDBTablePolicy()', () => {
    it('should refuse a table in another account', () => {
      expect(() =>
        createIamUser().addDynamoDBTablePolicy('accounts-access', createTable('999999999999'), {
          allowRead: true,
          allowWrite: false,
        }),
      ).toThrow('Table "accounts" is in account "999999999999", not in the user\'s account "123456789012"!');
    });
  });

  describe('diffProperties()', () => {
    it('should delete and add a policy whose body moved under the same id', async () => {
      const previous = createIamUser();
      previous.addDynamoDBTablePolicy('accounts-access', createTable('123456789012', 'us-east-1'), {
        allowRead: true,
        allowWrite: false,
      });
      const current = createIamUser();
      current.addDynamoDBTablePolicy('accounts-access', createTable('123456789012', 'us-west-2'), {
        allowRead: true,
        allowWrite: false,
      });

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => [d.action, d.field, (d.value as any).action, (d.value as any).policyId])).toEqual([
        ['update', 'dynamodb-table-access-policy', 'delete', 'accounts-access'],
        ['update', 'dynamodb-table-access-policy', 'add', 'accounts-access'],
      ]);
    });
  });

  describe('toHCL()', () => {
    it('should grant read on a table and its indexes, and write on the table only', async () => {
      const { emitted, terraform } = createRecordingScope();
      const iamUser = createIamUser();
      iamUser.addDynamoDBTablePolicy('accounts-access', createTable('123456789012'), {
        allowRead: true,
        allowWrite: true,
      });
      await iamUser.toHCL(terraform);

      expect(emitted.map((e) => `${e.type} ${e.name}`)).toEqual([
        'aws_iam_user iam-user-test-user',
        'aws_iam_policy iam-user-test-user_accounts-access',
        'aws_iam_user_policy_attachment iam-user-test-user_accounts-access_attach',
      ]);
      const statements = emitted.find((e) => e.type === 'aws_iam_policy')!.spec.policy.Statement;
      expect(statements.map((s: any) => s.Resource)).toEqual([
        [
          'arn:aws:dynamodb:us-east-1:123456789012:table/accounts',
          'arn:aws:dynamodb:us-east-1:123456789012:table/accounts/index/*',
        ],
        ['arn:aws:dynamodb:us-east-1:123456789012:table/accounts'],
      ]);
    });
  });

  describe('addS3BucketPolicy()', () => {
    it('should grant a bucket in its own account by the bucket name', () => {
      const iamUser = new IamUser('iam-user-test-user', {
        awsAccountId: '123456789012',
        policies: [],
        username: 'test-user',
      });
      iamUser.addS3BucketPolicy('receipts-access', createBucket('123456789012'), 'uploads', {
        allowRead: true,
        allowWrite: false,
      });

      expect(iamUser.properties.policies).toEqual([
        {
          policy: { accessPrefix: 'uploads', allowRead: true, allowWrite: false, bucketName: 'receipts' },
          policyId: 'receipts-access',
          policyType: 's3-storage-access-policy',
        },
      ]);
    });

    it('should refuse a bucket in another account', () => {
      const iamUser = new IamUser('iam-user-test-user', {
        awsAccountId: '123456789012',
        policies: [],
        username: 'test-user',
      });

      expect(() =>
        iamUser.addS3BucketPolicy('receipts-access', createBucket('999999999999'), 'uploads', {
          allowRead: true,
          allowWrite: false,
        }),
      ).toThrow('Bucket "receipts" is in account "999999999999", not in the user\'s account "123456789012"!');
    });
  });
});
