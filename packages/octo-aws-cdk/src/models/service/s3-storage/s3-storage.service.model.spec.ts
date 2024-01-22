import { App, DiffMetadata, LocalStateProvider, UnknownResource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAws, RegionId } from '../../../index.js';
import { S3StorageService } from './s3-storage.service.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('S3StorageService UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    let octoAws: OctoAws;

    let app: App;
    let service: S3StorageService;

    beforeEach(async () => {
      octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));

      app = new App('test');
      service = new S3StorageService(RegionId.AWS_US_EAST_1A, 'test-bucket');
      app.addService(service);

      const diffs0 = await octoAws.diff(app);
      const generator0 = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult0 = (await generator0.next()) as IteratorResult<UnknownResource[]>;
      await octoAws.commitTransaction(app, modelTransactionResult0.value, resourcesResult0.value);
    });

    it('should be able to CUD on the storage', async () => {
      service.addDirectory('uploads');

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult1 = await generator1.next();
      await octoAws.commitTransaction(app, modelTransactionResult1.value, resourcesResult1.value);

      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "update",
              "field": "add-directories",
              "value": [
                {
                  "directoryReadAnchorName": "uploadsDirectoryReaderRole",
                  "directoryWriteAnchorName": "uploadsDirectoryWriterRole",
                  "remoteDirectoryPath": "uploads",
                },
              ],
            },
          ],
        ]
      `);

      // Remove storage bucket.
      service.remove(true);

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(app, modelTransactionResult2.value, resourcesResult2.value);

      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
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
});
