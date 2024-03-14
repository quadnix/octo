import { CreatePolicyCommand, CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { App, Container, DiffMetadata, Image, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsServer, OctoAws, RegionId, S3StorageAccess, S3StorageService } from '../../../index.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('S3StorageService UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  const runDetachedProcessMock: jest.MockedFunction<any> = jest.spyOn(ProcessUtility, 'runDetachedProcess');

  beforeAll(() => {
    TestContainer.create(
      [
        {
          type: IAMClient,
          value: { send: jest.fn() },
        },
        {
          type: S3Client,
          value: { send: jest.fn() },
        },
      ],
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
    octoAws.registerInputs({
      'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
    });

    // Add the S3StorageService, and a Server.
    const app = new App('test');
    const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
    app.addService(service);
    const image = new Image('quadnix/test', '0.0.1', {
      dockerfilePath: 'path/to/Dockerfile',
    });
    app.addImage(image);
    const server = new AwsServer('Backend', image);
    app.addServer(server);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult1 = await generator1.next();
    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult1.value);
    expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "add",
            "field": "resourceId",
            "value": "bucket-test-bucket",
          },
          {
            "action": "add",
            "field": "resourceId",
            "value": "iam-role-BackendServiceRole",
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
    /* eslint-disable spellcheck/spell-checker */
    expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "update",
            "field": "3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
            "value": {
              "action": "add",
              "overlay": S3StorageAccessOverlay {
                "MODEL_NAME": "s3-storage-access",
                "MODEL_TYPE": "overlay",
                "anchors": [
                  {
                    "anchorId": "BackendServiceRole",
                    "parent": "server=Backend,app=test",
                  },
                ],
                "dependencies": [
                  {
                    "from": "s3-storage-access=3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
                    "relationship": undefined,
                    "to": "server=Backend,app=test",
                  },
                ],
                "overlayId": "3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
                "properties": {
                  "allowRead": true,
                  "allowWrite": false,
                  "bucketName": "test-bucket",
                  "remoteDirectoryPath": "uploads",
                },
              },
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
    /* eslint-disable spellcheck/spell-checker */
    expect(resourceTransactionResult3.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "update",
            "field": "3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
            "value": {
              "action": "delete",
              "overlay": S3StorageAccessOverlay {
                "MODEL_NAME": "s3-storage-access",
                "MODEL_TYPE": "overlay",
                "anchors": [
                  {
                    "anchorId": "BackendServiceRole",
                    "parent": "server=Backend,app=test",
                  },
                ],
                "dependencies": [
                  {
                    "from": "s3-storage-access=3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
                    "relationship": undefined,
                    "to": "server=Backend,app=test",
                  },
                ],
                "overlayId": "3e39ca7917d5cb8f6b85668a9a5263bb6ac9cc35",
                "properties": {
                  "allowRead": true,
                  "allowWrite": false,
                  "bucketName": "test-bucket",
                  "remoteDirectoryPath": "uploads",
                },
              },
            },
          },
        ],
      ]
    `);
    /* eslint-enable */

    // Remove all directories, and delete the service.
    await service.removeDirectory('uploads');
    service.remove();

    const diffs4 = await octoAws.diff(app);
    const generator4 = await octoAws.beginTransaction(diffs4, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult4 = await generator4.next();
    const modelTransactionResult4 = (await generator4.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult4.value);
    expect(resourceTransactionResult4.value).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "delete",
            "field": "resourceId",
            "value": "bucket-test-bucket",
          },
        ],
      ]
    `);
  });
});
