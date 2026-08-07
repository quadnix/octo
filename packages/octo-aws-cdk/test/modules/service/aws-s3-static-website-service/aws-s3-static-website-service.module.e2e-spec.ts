import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { type AwsAccountAnchorSchema, AwsS3StaticWebsiteServiceModule } from '../../../../src/index.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');
const websiteSourcePath = join(__dirname, '../../../../resources', 's3-static-website');

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

describe('AwsS3StaticWebsiteServiceModule E2E', () => {
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
    await testModuleContainer
      .runModules<AwsS3StaticWebsiteServiceModule>(
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: AWS_REGION_ID,
            bucketName: 'test-bucket',
            directoryPath: websiteSourcePath,
          },
          moduleId: 'service',
          type: AwsS3StaticWebsiteServiceModule,
        },
        { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    /* eslint-disable spellcheck/spell-checker */
    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_s3_bucket.bucket-test-bucket_website_bucket",
       "aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config",
       "aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access",
       "aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy",
       "aws_s3_object.bucket-test-bucket_file_errorhtml",
       "aws_s3_object.bucket-test-bucket_file_indexhtml",
       "aws_s3_object.bucket-test-bucket_file_page1html",
     ]
    `);
    /* eslint-enable */
  }, 300_000);
});
