import { CreatePolicyCommand, CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../../test/helpers/test-models.js';
import { AwsServer, OctoAws, RegionId, S3StorageAccess, S3StorageService } from '../../../index.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('S3StorageService UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  const runDetachedProcessMock: jest.MockedFunction<any> = jest.spyOn(ProcessUtility, 'runDetachedProcess');

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: IAMClient,
            value: { send: jest.fn() },
          },
          {
            type: S3Client,
            value: { send: jest.fn() },
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );

    runDetachedProcessMock.mockReturnValue({
      on: jest.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'exit') {
          cb(0);
        }
      }),
      removeAllListeners: jest.fn(),
    });
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  it('should test e2e', async () => {
    const iamClient = await Container.get(IAMClient);
    (iamClient.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof CreateRoleCommand) {
        return { Role: { Arn: 'roleArn', RoleId: 'roleId', RoleName: 'roleName' } };
      } else if (instance instanceof CreatePolicyCommand) {
        return { Policy: { Arn: 'policyArn' } };
      }
    });

    const s3Client = await Container.get(S3Client);
    (s3Client.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof ListObjectsV2Command) {
        return { Contents: [], NextContinuationToken: null };
      }
    });

    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));

    // Add the S3StorageService, and a Server.
    const app = new App('test');
    const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
    app.addService(service);
    const server = new AwsServer('Backend');
    app.addServer(server);

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "s3-storage=bucket-test-bucket",
           "value": "bucket-test-bucket",
         },
         {
           "action": "add",
           "field": "resourceId",
           "model": "iam-role=iam-role-Backend-ServerRole",
           "value": "iam-role-Backend-ServerRole",
         },
       ],
     ]
    `);

    // Allow Server to access one of the S3StorageService directory.
    service.addDirectory('uploads');
    await service.allowDirectoryAccess(server, 'uploads', S3StorageAccess.READ);

    const diffs2 = await octoAws.diff(app);
    const generator2 = await octoAws.beginTransaction(diffs2, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult2 = await generator2.next();
    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult2.value);
    resourceTransactionResult2.value[0][0].value.overlay =
      resourceTransactionResult2.value[0][0].value.overlay.overlayId;

    /* eslint-disable spellcheck/spell-checker */
    expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
           "model": "iam-role=iam-role-Backend-ServerRole",
           "value": {
             "action": "add",
             "overlay": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
           },
         },
       ],
     ]
    `);
    /* eslint-enable */

    // Revoke Server access from one of the S3StorageService directory.
    await service.revokeDirectoryAccess(server, 'uploads', S3StorageAccess.READ);

    const diffs3 = await octoAws.diff(app);
    const generator3 = await octoAws.beginTransaction(diffs3, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult3 = await generator3.next();
    const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult3.value);
    resourceTransactionResult3.value[0][0].value.overlay =
      resourceTransactionResult3.value[0][0].value.overlay.overlayId;

    /* eslint-disable spellcheck/spell-checker */
    expect(resourceTransactionResult3.value).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
           "model": "iam-role=iam-role-Backend-ServerRole",
           "value": {
             "action": "delete",
             "overlay": "s3-storage-access-overlay-bef965544998fce2711e8c5b41c7546cdb4f13ac",
           },
         },
       ],
     ]
    `);
    /* eslint-enable */

    // Remove all directories, and delete the service.
    await service.removeDirectory('uploads');
    service.remove();

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "s3-storage=bucket-test-bucket",
           "value": "bucket-test-bucket",
         },
       ],
     ]
    `);
  });
});
