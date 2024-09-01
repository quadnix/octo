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

    const TestModule = async ({ commit = false, includeImage = false }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');

      if (includeImage) {
        const image = new AwsImage('quadnix/test', '0.0.1', {
          dockerfilePath: 'path/to/Dockerfile',
        });
        app.addImage(image);
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

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

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add image', async () => {
      const app = await TestModule({
        commit: false,
        includeImage: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });

    it('should remove image', async () => {
      const app = await TestModule({
        commit: false,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
