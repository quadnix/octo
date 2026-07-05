import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { AwsIniAccountModule } from '../../../../src/modules/account/aws-ini-account/index.js';
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

describe('AwsIniAccountModule E2E', () => {
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
        .runModules<AwsIniAccountModule>(
          app,
          {
            inputs: {
              accountId: AWS_ACCOUNT_ID,
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toEqual([]);
  }, 300_000);
});
