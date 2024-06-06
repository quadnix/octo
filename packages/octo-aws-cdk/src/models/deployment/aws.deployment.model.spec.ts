/**
 * This test is currently incomplete because of the inability of Jest
 * to not be able to mock an ES module.
 * The issue is tracked here: https://github.com/jestjs/jest/issues/10025
 * And the PR is here: https://github.com/jestjs/jest/pull/10976
 *
 * We could make it work by using `unstable_mockModule()`,
 * but we would have to make following changes,
 * * Move jest.unstable_mockModules() to top of test.
 * * Change the import to use await, e.g. `const { existsSync } = await import('fs');`
 *
 * We do not wish to make these changes right now,
 * so we will wait for the PR to be merged and do this the right way.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { App, Container, type DiffMetadata, Image, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsDeployment, AwsServer, OctoAws, RegionId, S3StorageService } from '../../index.js';
import { ProcessUtility } from '../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

// jest.unstable_mockModule('fs', () => ({
//   createReadStream: jest.fn(),
// }));
//
// jest.unstable_mockModule('@aws-sdk/lib-storage', () => {
//   class UploadMock {
//     async done(): Promise<void> {}
//   }
//
//   return {
//     Upload: UploadMock,
//   };
// });

describe.skip('AwsDeployment UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  const runDetachedProcessMock: jest.MockedFunction<any> = jest.spyOn(ProcessUtility, 'runDetachedProcess');

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
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
    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));
    octoAws.registerInputs({
      'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
      'input.server.Backend.deployment.v0.0.1.deploymentFolderLocalPath': 'resources',
    });

    // Add a S3StorageService, and a Server.
    const app = new App('test');
    const service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
    app.addService(service);
    const image = new Image('quadnix/test', '0.0.1', {
      dockerfilePath: 'path/to/Dockerfile',
    });
    app.addImage(image);
    const server = new AwsServer('Backend', image);
    app.addServer(server);

    const diffs0 = await octoAws.diff(app);
    const generator0 = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
    });

    // Prevent generator from running real resource actions.
    const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult0.value);

    // Add a deployment.
    const deployment = new AwsDeployment('v0.0.1', service);
    server.addDeployment(deployment);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult1 = await generator1.next();
    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult1.value);
    expect(resourceTransactionResult1.value).toMatchInlineSnapshot();
  });
});
