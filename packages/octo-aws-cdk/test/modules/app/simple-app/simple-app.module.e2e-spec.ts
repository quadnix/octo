import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from '../../../../src/modules/app/simple-app/index.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

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
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          app,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toEqual([]);
  }, 300_000);
});
