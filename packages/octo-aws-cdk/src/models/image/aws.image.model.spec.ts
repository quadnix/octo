import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { OctoAwsCdkPackageMock } from '../../index.js';
import { AwsImage } from './aws.image.model.js';

describe('Image UT', () => {
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

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        inputs: {
          'input.image.dockerExecutable': 'docker',
        },
      });
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should create new image repository and delete it', async () => {
      // Add image.
      const app = new App('test');
      const image1 = new AwsImage('quadnix/test', '0.0.1', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image1);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);

      // Remove image.
      image1.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
