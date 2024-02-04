import { jest } from '@jest/globals';
import { App, DiffMetadata, Image, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAws } from '../../index.js';
import { ProcessUtility } from '../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Image UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  let runDetachedProcessMock: jest.MockedFunction<any>;

  beforeEach(() => {
    runDetachedProcessMock = jest.spyOn(ProcessUtility, 'runDetachedProcess');
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    it('should create new image repository and delete it', async () => {
      runDetachedProcessMock.mockReturnValue({
        on: jest.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === 'exit') {
            cb(0);
          }
        }),
        removeAllListeners: jest.fn(),
      });

      const octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
      });

      const app = new App('test');
      const image1 = new Image('quadnix/test', '0.0.1', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image1);

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldResourceDiffs: true,
      });

      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourceDiffsResult1 = await generator1.next();
      await octoAws.commitTransaction(app, modelTransactionResult1.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [],
        ]
      `);

      // Remove image.
      image1.remove();

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldResourceDiffs: true,
      });

      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(app, modelTransactionResult2.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [],
        ]
      `);
    });
  });
});
