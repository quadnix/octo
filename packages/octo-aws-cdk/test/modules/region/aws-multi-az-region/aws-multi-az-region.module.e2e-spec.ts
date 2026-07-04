import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Account, type App, TerraformUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import { AwsMultiAzRegionModule } from '../../../../src/modules/region/aws-multi-az-region/index.js';
import { AwsMultiAzRegionId } from '../../../../src/modules/region/aws-multi-az-region/index.schema.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>(
      'AwsAccountAnchor',
      { awsAccountId: AWS_ACCOUNT_ID },
      account,
    ),
  );

  return { account, app };
}

describe('AwsMultiAzRegionModule E2E', () => {
  let terraformUtility: TerraformUtility;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();
    terraformUtility = await container.get(TerraformUtility);

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/16',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    await terraformUtility.validate(outputDir);
    await terraformUtility.plan(outputDir);
  }, 300_000);
});
