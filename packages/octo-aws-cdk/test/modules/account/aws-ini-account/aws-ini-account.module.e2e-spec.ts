import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { AwsIniAccountModule } from '../../../../src/modules/account/aws-ini-account/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
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
    await setup(testModuleContainer);
    const { hclRender, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
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
    expect(Object.keys(HclUtility.parse(hclRender).resource)).toEqual([]);
  }, 300_000);
});
