import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr';
import { jest } from '@jest/globals';
import { App, Container, DiffMetadata, Image, LocalStateProvider, TestContainer } from '@quadnix/octo';
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

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: ECRClient,
            value: { send: jest.fn() },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
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

      const ecrClient = await Container.get(ECRClient);
      (ecrClient.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof DescribeImagesCommand) {
          const error = new Error();
          error.name = 'RepositoryNotFoundException';
          throw error;
        } else if (instance instanceof CreateRepositoryCommand) {
          return { repository: {} };
        } else if (instance instanceof GetAuthorizationTokenCommand) {
          return {
            authorizationData: [{ authorizationToken: 'authorizationToken', proxyEndpoint: 'https://endpoint' }],
          };
        }
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
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult1 = await generator1.next();
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult1.value);

      // Verify resource diff was as expected.
      expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "ecr-us-east-1-imageName:0.0.1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "ecr-us-east-1-imageName:0.0.2",
            },
          ],
        ]
      `);

      // Remove image.
      service.removeImage('imageName', '0.0.1');

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult2 = await generator2.next();
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult2.value);

      // Verify resource diff was as expected.
      expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "ecr-us-east-1-imageName:0.0.1",
            },
          ],
        ]
      `);

      // Remove region.
      service.removeRegion(RegionId.AWS_US_EAST_1A);

      const diffs3 = await octoAws.diff(app);
      const generator3 = await octoAws.beginTransaction(diffs3, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult3 = await generator3.next();
      const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult3.value);

      // Verify resource diff was as expected.
      expect(resourceTransactionResult3.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "ecr-us-east-1-imageName:0.0.2",
            },
          ],
        ]
      `);
    });
  });
});
