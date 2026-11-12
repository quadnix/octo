import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import type { ValidateReport } from '../utilities/octo/validate-report.utility.js';
import { AccountRepository } from './account.repository.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-dynamodb-service' };

// A resource id ends in a hash of its scope.
const TABLE_ADDRESS = /^aws_dynamodb_table\.dynamodb-accounts-[0-9a-f]+$/;

/**
 * How long an item is given to reach a global secondary index. A GSI is read only eventually
 * consistently, so an item written a moment ago may not be in it yet.
 */
const GSI_POLL_ATTEMPTS = 10;

const GSI_POLL_INTERVAL_IN_MS = 1_000;

/**
 * Queries a global secondary index until it returns items, or gives up and returns the last answer.
 */
async function queryIndexUntilFound<T>(query: () => Promise<T[]>): Promise<T[]> {
  let items = await query();
  for (let attempt = 1; attempt < GSI_POLL_ATTEMPTS && items.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, GSI_POLL_INTERVAL_IN_MS));
    items = await query();
  }

  return items;
}

jest.setTimeout(1_800_000);

describe('Main E2E', () => {
  const accountRepository = new AccountRepository(AWS_REGION_ID);
  const environment = { AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID };

  /**
   * Writes `octo.yaml` with the email index added, the only change this suite makes to the table.
   */
  const writeDefinitionWithEmailIndex = (): Promise<string> =>
    OctoCliUtility.writeDefinition(__dirname, 'email-index', (definition) => {
      const inputs = definition.modules.find((module) => module.moduleId === 'dynamodb-service-module')!
        .moduleInputs as { AttributeDefinitions: unknown[]; GlobalSecondaryIndexes: unknown[] };
      inputs.AttributeDefinitions.push({ AttributeName: 'Email', AttributeType: 'S' });
      inputs.GlobalSecondaryIndexes.push({
        IndexName: 'AccountEmailIndex',
        KeySchema: [{ AttributeName: 'Email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      });
    });

  /**
   * Asserts the report updates the table in place, which keeps its items, and touches nothing else.
   */
  const expectTableUpdatedInPlace = (report: ValidateReport): void => {
    expect(report.failures).toEqual([]);
    expect(report.drift).toEqual([]);
    expect(report.dataLoss).toEqual([]);
    expect(report.changes).toEqual([
      { action: 'update', address: expect.stringMatching(TABLE_ADDRESS), fields: expect.any(Array) },
    ]);
    expect(report.changes[0].fields).toContain('global_secondary_index');
  };

  it('should create the table', async () => {
    const report = await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    expect(report.failures).toEqual([]);
    expect(report.changes).toEqual([{ action: 'create', address: expect.stringMatching(TABLE_ADDRESS), fields: [] }]);
  });

  it('should plan nothing when the applied intent is planned again', async () => {
    const report = await OctoCliUtility.validate(__dirname, 'octo.yaml', environment);

    expect(report.confidence).toBe('exact');
    expect(report.changes).toEqual([]);
    expect(report.drift).toEqual([]);
  });

  it('should read and write items by key and by every index', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepository.put({
      AccountId: 'TestCRUD',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 10,
      UserId: 'test-user-1',
    });

    expect(await accountRepository.getByAccountId('TestCRUD')).toHaveLength(1);
    expect(await accountRepository.getByAccountIdAndType('TestCRUD', 'test')).toBeDefined();
    expect(await queryIndexUntilFound(() => accountRepository.getByUserId('test-user-1'))).toHaveLength(1);
    expect(await accountRepository.getByAccountIdAndCreatedAt('TestCRUD', createdAt - 10, createdAt + 10)).toHaveLength(
      1,
    );

    // The email index is not declared yet.
    await expect(accountRepository.getByEmail('test-user-1@test.com')).rejects.toThrow();

    await accountRepository.update('TestCRUD', 'test', { Email: 'test-user-1-updated@test.com' });
    expect((await accountRepository.getByAccountId('TestCRUD'))[0].Email).toBe('test-user-1-updated@test.com');

    await accountRepository.delete('TestCRUD', 'test');
    expect(await accountRepository.getByAccountId('TestCRUD')).toHaveLength(0);
  });

  it('should add an index in place, keeping the items already written', async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    await accountRepository.put({
      AccountId: 'TestAddGSI',
      AccountType: 'test',
      CreatedAt: createdAt,
      Email: 'test-user-1@test.com',
      ExpiresAt: createdAt + 600,
      UserId: 'test-user-1',
    });

    const report = await OctoCliUtility.lifecycle(__dirname, await writeDefinitionWithEmailIndex(), environment);

    expectTableUpdatedInPlace(report);
    expect(await queryIndexUntilFound(() => accountRepository.getByEmail('test-user-1@test.com'))).toHaveLength(1);
  });

  it('should remove an index in place, keeping the items already written', async () => {
    const report = await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    expectTableUpdatedInPlace(report);
    await expect(accountRepository.getByEmail('test-user-1@test.com')).rejects.toThrow();
    expect(await accountRepository.getByAccountId('TestAddGSI')).toHaveLength(1);

    await accountRepository.delete('TestAddGSI', 'test');
  });

  it('should refuse to destroy the table until its destroy is named', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'teardown', (definition) => {
      definition.modules = definition.modules.filter((module) =>
        ['account-module', 'app-module'].includes(module.moduleId),
      );
    });

    // The refused apply changes nothing, and names the destroy to approve.
    const refusal = OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment, { allowDestroy: [] });
    await expect(refusal).rejects.toThrow(
      /--allowDestroy 'dynamodb-service-module\/aws_dynamodb_table\.dynamodb-accounts-[0-9a-f]+'/,
    );
    const tableAddress = /--allowDestroy 'dynamodb-service-module\/(\S+)'/.exec(
      String(await refusal.catch((error: Error) => error.message)),
    )![1];

    const report = await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment, {
      allowDestroy: [`dynamodb-service-module/${tableAddress}`],
    });

    expect(report.dataLoss).toEqual([expect.stringContaining(tableAddress)]);
    expect(await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS)).toEqual([]);
  });
});
