import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { EcrService, OctoAwsCdkPackageMock, RegionId } from '../../../index.js';
import type { IEcrImageResponse } from '../../../resources/ecr/ecr-image.interface.js';
import { AwsImage } from '../../image/aws.image.model.js';

describe('EcrService UT', () => {
  const stateProvider = new TestStateProvider();

  beforeAll(async () => {
    await TestContainer.create(
      {
        importFrom: [OctoAwsCdkPackageMock],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  describe('addImage()', () => {
    it('should throw error trying to add an image to a service without region', () => {
      const service = new EcrService('test');
      const image = new AwsImage('test', '0.0.1', { dockerfilePath: '/dockerExec' });

      expect(() => {
        service.addImage(image);
      }).toThrowErrorMatchingInlineSnapshot(
        `"This service has not been configured with a region yet! Please add a region first."`,
      );
    });

    it('should throw error trying to add an image to another service', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      const image = new AwsImage('another', '0.0.1', { dockerfilePath: '/dockerExec' });

      expect(() => {
        service.addImage(image);
      }).toThrowErrorMatchingInlineSnapshot(`"Invalid image! This ECR container is not for the given image."`);
    });

    it('should not add a duplicate image', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);

      const image1 = new AwsImage('test', '0.0.1', { dockerfilePath: '/dockerExec' });
      service.addImage(image1);

      const image2 = new AwsImage('test', '0.0.1', { dockerfilePath: '/dockerExec' });
      service.addImage(image2);

      expect(service.images).toHaveLength(1);
    });
  });

  describe('addRegion()', () => {
    it('should not add a duplicate region', () => {
      const service = new EcrService('test');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      service.addRegion(RegionId.AWS_US_EAST_1A);

      expect(service.awsRegionIds).toHaveLength(1);
    });
  });

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    const TestModule = async ({
      commit = false,
      includeEcr = false,
      includeEcrImage1 = false,
      includeEcrImage2 = false,
      includeEcrRegion = false,
    }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');

      if (includeEcr) {
        const service = new EcrService('imageName');
        app.addService(service);

        if (includeEcrRegion) {
          service.addRegion(RegionId.AWS_US_EAST_1A);
        }

        if (includeEcrImage1) {
          const image1 = new AwsImage('imageName', '0.0.1', { dockerfilePath: 'Dockerfile' });
          app.addImage(image1);
          service.addImage(image1);
        }

        if (includeEcrImage2) {
          const image2 = new AwsImage('imageName', '0.0.2', { dockerfilePath: 'Dockerfile' });
          app.addImage(image2);
          service.addImage(image2);
        }
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'ecr-us-east-1-imageName:0.0.1': {
            response: <Partial<IEcrImageResponse>>{
              awsRegionId: 'us-east-1',
              registryId: 'RegistryId',
              repositoryArn: 'RepositoryArn',
              repositoryName: 'RepositoryName',
              repositoryUri: 'RepositoryUri',
            },
          },
          'ecr-us-east-1-imageName:0.0.2': {
            response: <Partial<IEcrImageResponse>>{
              awsRegionId: 'us-east-1',
              registryId: 'RegistryId',
              repositoryArn: 'RepositoryArn',
              repositoryName: 'RepositoryName',
              repositoryUri: 'RepositoryUri',
            },
          },
        },
        inputs: {
          'input.image.dockerExecutable': 'docker',
        },
      });
      await testModuleContainer.initialize(stateProvider);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add an image in ECR', async () => {
      const app = await TestModule({
        commit: false,
        includeEcr: true,
        includeEcrImage1: true,
        includeEcrImage2: true,
        includeEcrRegion: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "ecr-image=ecr-us-east-1-imageName:0.0.1",
             "value": "ecr-us-east-1-imageName:0.0.1",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "ecr-image=ecr-us-east-1-imageName:0.0.2",
             "value": "ecr-us-east-1-imageName:0.0.2",
           },
         ],
       ]
      `);
    });

    it('should remove an image in ECR', async () => {
      const app = await TestModule({
        commit: false,
        includeEcr: true,
        includeEcrImage2: true,
        includeEcrRegion: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "ecr-image=ecr-us-east-1-imageName:0.0.1",
             "value": "ecr-us-east-1-imageName:0.0.1",
           },
         ],
       ]
      `);
    });

    it('should remove a region in ECR', async () => {
      const app = await TestModule({
        commit: false,
        includeEcr: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "ecr-image=ecr-us-east-1-imageName:0.0.2",
             "value": "ecr-us-east-1-imageName:0.0.2",
           },
         ],
       ]
      `);
    });
  });
});
