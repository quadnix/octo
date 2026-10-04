import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import { AwsMultiAzRegionModule } from '../../../../src/modules/region/aws-multi-az-region/index.js';
import { AwsMultiAzRegionId } from '../../../../src/modules/region/aws-multi-az-region/index.schema.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    account: [account],
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
}

describe('AwsMultiAzRegionModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

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
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(Object.keys(HclUtility.parse(hclRender).resource)).toMatchInlineSnapshot(`
     [
       "aws_vpc.vpc-test-region-bbdcf0",
       "aws_internet_gateway.igw-test-region-bbdcf0",
     ]
    `);
  }, 300_000);
});
