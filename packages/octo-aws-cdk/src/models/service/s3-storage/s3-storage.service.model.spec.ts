import { App, DiffMetadata, LocalStateProvider, Resource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegionId, OctoAws } from '../../../index.js';
import { AwsRegion } from '../../region/aws.region.model.js';
import { S3StorageService } from './s3-storage.service.model.js';

const unlinkAsync = promisify(unlink);

describe('S3StorageService UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    let app: App;
    let region: AwsRegion;

    let octoAws: OctoAws;

    beforeEach(async () => {
      app = new App('test');
      region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      const localStateProvider = new LocalStateProvider(__dirname);
      octoAws = new OctoAws(region, localStateProvider);
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs0 = await octoAws.diff();
      const generator = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);
    });

    it('should be able to CUD on the storage', async () => {
      // Add storage bucket.
      const service: S3StorageService = new S3StorageService(region, 'test-storage-bucket');
      app.addService(service);

      const diffs1 = await octoAws.diff();
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
      const resourceDiffsResult1 = await generator1.next();
      await octoAws.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "bucket-test-storage-bucket",
            },
          ],
        ]
      `);

      // Add directory to storage.
      service.addDirectory('uploads');

      const diffs2 = await octoAws.diff();
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);

      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "update",
              "field": "update-add-directories",
              "value": {
                "directoryReadAnchorName": "uploadsDirectoryReaderRole",
                "directoryWriteAnchorName": "uploadsDirectoryWriterRole",
                "remoteDirectoryPath": "uploads",
              },
            },
          ],
        ]
      `);

      // Remove storage bucket.
      service.remove(true);

      const diffs3 = await octoAws.diff();
      const generator3 = await octoAws.beginTransaction(diffs3, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult3 = (await generator3.next()) as IteratorResult<Resource<unknown>[]>;
      const resourceDiffsResult3 = await generator3.next();
      await octoAws.commitTransaction(modelTransactionResult3.value, resourcesResult3.value);

      expect(resourceDiffsResult3.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "bucket-test-storage-bucket",
            },
          ],
        ]
      `);
    });
  });
});
