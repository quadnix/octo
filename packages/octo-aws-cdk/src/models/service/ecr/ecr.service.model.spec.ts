import { jest } from '@jest/globals';
import { App, DiffMetadata, Image, LocalStateProvider, UnknownResource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { EcrService, OctoAws, RegionId } from '../../../index.js';
import { ProcessUtility } from '../../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('EcrService UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('addImage()', () => {
    it('should throw error trying to add an image to a service without region', () => {
      const service = new EcrService('test');
      const image = new Image('test', '0.0.1', { dockerfilePath: '/dockerExec' });

      expect(() => {
        service.addImage(image);
      }).toThrowErrorMatchingInlineSnapshot(
        `"This service has not been configured with a region yet! Please add a region first."`,
      );
    });

    it('should throw error trying to add an image to another service', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      const image = new Image('another', '0.0.1', { dockerfilePath: '/dockerExec' });

      expect(() => {
        service.addImage(image);
      }).toThrowErrorMatchingInlineSnapshot(`"Invalid image! This ECR container is not for the given image."`);
    });

    it('should not add a duplicate image', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);

      const image1 = new Image('test', '0.0.1', { dockerfilePath: '/dockerExec' });
      service.addImage(image1);

      const image2 = new Image('test', '0.0.1', { dockerfilePath: '/dockerExec' });
      service.addImage(image2);

      expect(service.images.length).toBe(1);
    });
  });

  describe('addRegion()', () => {
    it('should not add a duplicate region', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      service.addRegion(RegionId.AWS_US_EAST_1A);

      expect(service.awsRegionIds.length).toBe(1);
    });
  });

  describe('diff()', () => {
    let runDetachedProcessMock: jest.MockedFunction<any>;

    beforeEach(() => {
      runDetachedProcessMock = jest.spyOn(ProcessUtility, 'runDetachedProcess');
    });

    it('should create a new image with ecr and delete it', async () => {
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
        'input.image.imageName:0.0.1.dockerExecutable': 'docker',
        'input.image.imageName:0.0.2.dockerExecutable': 'docker',
      });

      const app = new App('test');
      const image1 = new Image('imageName', '0.0.1', { dockerfilePath: 'Dockerfile' });
      app.addImage(image1);
      const image2 = new Image('imageName', '0.0.2', { dockerfilePath: 'Dockerfile' });
      app.addImage(image2);
      const service = new EcrService('imageName');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      service.addImage(image1);
      service.addImage(image2);
      app.addService(service);

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

      // Verify resource diff was as expected.
      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "us-east-1-imageName:0.0.1-ecr",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "us-east-1-imageName:0.0.2-ecr",
            },
          ],
        ]
      `);

      // Remove image.
      service.removeImage('imageName', '0.0.1');

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(app, modelTransactionResult2.value, resourcesResult2.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "us-east-1-imageName:0.0.1-ecr",
            },
          ],
        ]
      `);

      // Remove region.
      service.removeRegion(RegionId.AWS_US_EAST_1A);

      const diffs3 = await octoAws.diff(app);
      const generator3 = await octoAws.beginTransaction(diffs3, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator3 from running real resource actions.
      const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult3 = (await generator3.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult3 = await generator3.next();
      await octoAws.commitTransaction(app, modelTransactionResult3.value, resourcesResult3.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult3.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "us-east-1-imageName:0.0.2-ecr",
            },
          ],
        ]
      `);
    });
  });
});
