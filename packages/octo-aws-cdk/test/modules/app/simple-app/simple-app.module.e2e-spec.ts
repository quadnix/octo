import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from '../../../../src/modules/app/simple-app/index.js';
import { TerragruntRunner } from '../../../../src/utilities/terragrunt-runner/terragrunt-runner.utility.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('SimpleAppModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate no terraform resources to run against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<SimpleAppModule>({
      inputs: { name: 'test-app' },
      moduleId: 'app',
      type: SimpleAppModule,
    });

    const { outputDir, resourceDiffs } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    // The app module creates no resources, so generateHcl emits nothing for terragrunt to run.
    const runner = new TerragruntRunner(outputDir, { awsRegion: AWS_REGION_ID });
    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(await runner.collectTerraformResources()).toEqual([]);
  }, 300_000);
});
