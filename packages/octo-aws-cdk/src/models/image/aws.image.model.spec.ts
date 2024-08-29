import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { OctoAwsCdkPackageMock } from '../../index.js';
import { AwsImage } from './aws.image.model.js';

describe('Image UT', () => {
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

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        inputs: {
          'input.image.dockerExecutable': 'docker',
        },
      });
      await testModuleContainer.initialize(stateProvider);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should add image', async () => {
      const app = new App('test');
      const image = new AwsImage('quadnix/test', '0.0.1', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image);

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });

    it('should remove image', async () => {
      const app = new App('test');

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
