import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { EcrService, OctoAwsCdkPackageMock, RegionId } from '../../../index.js';
import type { IEcrImageResponse } from '../../../resources/ecr/ecr-image.interface.js';
import { AwsImage } from '../../image/aws.image.model.js';

describe('EcrService UT', () => {
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
          'input.image.imageName:0.0.1.dockerExecutable': 'docker',
          'input.image.imageName:0.0.2.dockerExecutable': 'docker',
        },
      });
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should create a new image with ecr and delete it', async () => {
      // Create images.
      const app = new App('test');
      const image1 = new AwsImage('imageName', '0.0.1', { dockerfilePath: 'Dockerfile' });
      app.addImage(image1);
      const image2 = new AwsImage('imageName', '0.0.2', { dockerfilePath: 'Dockerfile' });
      app.addImage(image2);
      const service = new EcrService('imageName');
      service.addRegion(RegionId.AWS_US_EAST_1A);
      service.addImage(image1);
      service.addImage(image2);
      app.addService(service);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecr-image=ecr-us-east-1-imageName:0.0.1",
             "value": "ecr-us-east-1-imageName:0.0.1",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecr-image=ecr-us-east-1-imageName:0.0.2",
             "value": "ecr-us-east-1-imageName:0.0.2",
           },
         ],
       ]
      `);

      // Remove an image.
      service.removeImage('imageName', '0.0.1');
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecr-image=ecr-us-east-1-imageName:0.0.1",
             "value": "ecr-us-east-1-imageName:0.0.1",
           },
         ],
       ]
      `);

      // Remove a region.
      service.removeRegion(RegionId.AWS_US_EAST_1A);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecr-image=ecr-us-east-1-imageName:0.0.2",
             "value": "ecr-us-east-1-imageName:0.0.2",
           },
         ],
       ]
      `);
    });
  });
});
