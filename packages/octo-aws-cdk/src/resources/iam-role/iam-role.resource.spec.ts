import { MatchingResource } from '@quadnix/octo';
import { DynamoDB } from '../dynamodb/dynamodb.resource.js';
import type { DynamoDBSchema } from '../dynamodb/index.schema.js';
import type { S3StorageSchema } from '../s3-storage/index.schema.js';
import { S3Storage } from '../s3-storage/s3-storage.resource.js';
import { IamRole } from './iam-role.resource.js';
import type { IamRoleSchema } from './index.schema.js';

type Properties = IamRoleSchema['properties'];

function createIamRole(policies: Properties['policies'] = []): IamRole {
  return new IamRole('iam-role-test-role', {
    awsAccountId: '123456789012',
    policies: [
      { policy: 'lambda.amazonaws.com', policyId: 'LambdaAssumeRolePolicy', policyType: 'assume-role-policy' },
      ...policies,
    ],
    rolename: 'test-role',
  });
}

function createTable(awsAccountId = '123456789012'): MatchingResource<DynamoDBSchema> {
  const table = new DynamoDB('dynamodb-accounts', {
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    awsAccountId,
    awsRegionId: 'us-east-1',
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

function createBucket(awsAccountId = '123456789012'): MatchingResource<S3StorageSchema> {
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

describe('IamRole UT', () => {
  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      const diffs = await createIamRole().diffProperties(createIamRole());
      expect(diffs).toEqual([]);
    });

    it('should delete and add a policy whose body moved under the same id', async () => {
      const previous = createIamRole([
        {
          policy: { allowRead: true, allowWrite: false, awsRegionId: 'us-east-1', tableName: 'accounts' },
          policyId: 'accounts-access',
          policyType: 'dynamodb-table-access-policy',
        },
      ]);
      const current = createIamRole([
        {
          policy: { allowRead: true, allowWrite: false, awsRegionId: 'us-west-2', tableName: 'accounts' },
          policyId: 'accounts-access',
          policyType: 'dynamodb-table-access-policy',
        },
      ]);

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => [d.action, d.field, (d.value as any).action, (d.value as any).policyId]))
        .toMatchInlineSnapshot(`
       [
         [
           "update",
           "dynamodb-table-access-policy",
           "delete",
           "accounts-access",
         ],
         [
           "update",
           "dynamodb-table-access-policy",
           "add",
           "accounts-access",
         ],
       ]
      `);
    });

    it('should delete a policy that is gone', async () => {
      const previous = createIamRole([
        {
          policy: { allowRead: true, allowWrite: false, awsRegionId: 'us-east-1', tableName: 'accounts' },
          policyId: 'accounts-access',
          policyType: 'dynamodb-table-access-policy',
        },
      ]);

      const diffs = await createIamRole().diffProperties(previous);
      expect(diffs.map((d) => [d.action, d.field, (d.value as any).action, (d.value as any).policyId])).toEqual([
        ['update', 'dynamodb-table-access-policy', 'delete', 'accounts-access'],
      ]);
    });

    it('should replace when the role name moves', async () => {
      const previous = createIamRole();
      const current = new IamRole('iam-role-test-role', { ...createIamRole().properties, rolename: 'other-role' });

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });
  });

  describe('toHCL()', () => {
    it('should trust every service principal it is given', async () => {
      const { emitted, terraform } = createRecordingScope();
      const iamRole = createIamRole([
        { policy: 'ecs-tasks.amazonaws.com', policyId: 'EcsAssumeRolePolicy', policyType: 'assume-role-policy' },
      ]);
      await iamRole.toHCL(terraform);

      const role = emitted.find((e) => e.type === 'aws_iam_role')!;
      expect(role.spec.assume_role_policy.Statement.map((s: any) => s.Principal.Service)).toEqual([
        'lambda.amazonaws.com',
        'ecs-tasks.amazonaws.com',
      ]);
    });

    it('should grant read on a table and its indexes, and write on the table only', async () => {
      const { emitted, terraform } = createRecordingScope();
      const iamRole = createIamRole();
      iamRole.addDynamoDBTablePolicy('accounts-access', createTable(), { allowRead: true, allowWrite: true });
      await iamRole.toHCL(terraform);

      expect(emitted.map((e) => `${e.type} ${e.name}`)).toMatchInlineSnapshot(`
       [
         "aws_iam_role iam-role-test-role",
         "aws_iam_policy iam-role-test-role_accounts-access",
         "aws_iam_role_policy_attachment iam-role-test-role_accounts-access_attach",
       ]
      `);
      expect(emitted.find((e) => e.type === 'aws_iam_policy')!.spec.policy.Statement).toMatchInlineSnapshot(`
       [
         {
           "Action": [
             "dynamodb:BatchGetItem",
             "dynamodb:ConditionCheckItem",
             "dynamodb:DescribeTable",
             "dynamodb:GetItem",
             "dynamodb:Query",
             "dynamodb:Scan",
           ],
           "Effect": "Allow",
           "Resource": [
             "arn:aws:dynamodb:us-east-1:123456789012:table/accounts",
             "arn:aws:dynamodb:us-east-1:123456789012:table/accounts/index/*",
           ],
           "Sid": "Allowreadfromtableaccounts",
         },
         {
           "Action": [
             "dynamodb:BatchWriteItem",
             "dynamodb:DeleteItem",
             "dynamodb:PutItem",
             "dynamodb:UpdateItem",
           ],
           "Effect": "Allow",
           "Resource": [
             "arn:aws:dynamodb:us-east-1:123456789012:table/accounts",
           ],
           "Sid": "Allowwritetotableaccounts",
         },
       ]
      `);
    });

    it('should grant only read when write is not allowed', async () => {
      const { emitted, terraform } = createRecordingScope();
      const iamRole = createIamRole();
      iamRole.addDynamoDBTablePolicy('accounts-access', createTable(), { allowRead: true, allowWrite: false });
      await iamRole.toHCL(terraform);

      const statements = emitted.find((e) => e.type === 'aws_iam_policy')!.spec.policy.Statement;
      expect(statements.map((s: any) => s.Sid)).toEqual(['Allowreadfromtableaccounts']);
    });

    it('should allow each IAM statement as written, in one policy', async () => {
      const { emitted, terraform } = createRecordingScope();
      const iamRole = createIamRole();
      iamRole.addIamStatementsPolicy('test-role-iam-statements', [
        { actions: ['lambda:InvokeFunctionUrl'], resources: ['arn:aws:lambda:us-east-1:123456789012:function:auth'] },
        { actions: ['ses:SendEmail'], resources: ['arn:aws:ses:us-east-1:123456789012:identity/example.com'] },
      ]);
      await iamRole.toHCL(terraform);

      expect(emitted.map((e) => `${e.type} ${e.name}`)).toMatchInlineSnapshot(`
       [
         "aws_iam_role iam-role-test-role",
         "aws_iam_policy iam-role-test-role_test-role-iam-statements",
         "aws_iam_role_policy_attachment iam-role-test-role_test-role-iam-statements_attach",
       ]
      `);
      expect(emitted.find((e) => e.type === 'aws_iam_policy')!.spec.policy.Statement).toMatchInlineSnapshot(`
       [
         {
           "Action": [
             "lambda:InvokeFunctionUrl",
           ],
           "Effect": "Allow",
           "Resource": [
             "arn:aws:lambda:us-east-1:123456789012:function:auth",
           ],
         },
         {
           "Action": [
             "ses:SendEmail",
           ],
           "Effect": "Allow",
           "Resource": [
             "arn:aws:ses:us-east-1:123456789012:identity/example.com",
           ],
         },
       ]
      `);
    });
  });

  describe('addS3BucketPolicy()', () => {
    it('should refuse a bucket in another account', () => {
      expect(() =>
        createIamRole().addS3BucketPolicy('receipts-access', createBucket('999999999999'), 'uploads', {
          allowRead: true,
          allowWrite: false,
        }),
      ).toThrow('Bucket "receipts" is in account "999999999999", not in the role\'s account "123456789012"!');
    });
  });

  describe('addDynamoDBTablePolicy()', () => {
    it('should refuse a table in another account', () => {
      expect(() =>
        createIamRole().addDynamoDBTablePolicy('accounts-access', createTable('999999999999'), {
          allowRead: true,
          allowWrite: false,
        }),
      ).toThrow('Table "accounts" is in account "999999999999", not in the role\'s account "123456789012"!');
    });
  });
});
