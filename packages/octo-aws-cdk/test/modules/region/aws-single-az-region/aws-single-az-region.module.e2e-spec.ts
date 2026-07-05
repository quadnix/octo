import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import { AwsSingleAzRegionModule } from '../../../../src/modules/region/aws-single-az-region/index.js';
import { AwsSingleAzRegionId } from '../../../../src/modules/region/aws-single-az-region/index.schema.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

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

describe('AwsSingleAzRegionModule E2E', () => {
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

  it('should generate terragrunt that validates and plans against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsSingleAzRegionModule>(
        app,
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region',
          type: AwsSingleAzRegionModule,
        },
        { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_vpc.vpc-test-region",
       "aws_internet_gateway.igw-test-region",
     ]
    `);
  }, 300_000);
});
