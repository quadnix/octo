import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { jest } from '@jest/globals';
import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModule } from '../../../../src/modules/service/aws-s3-static-website-service/index.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_OUTPUT_DIR = join(__dirname, 'generated', 'public');
const CLOUD_FRONT_OUTPUT_DIR = join(__dirname, 'generated', 'cloud-front');
const websiteSourcePath = join(__dirname, '../../../../resources', 's3-static-website');

/**
 * The CloudFront API the invalidation resource reaches for. An invalidation is an external resource,
 * so it runs for real even in a plan-only run, where the distribution it names exists only as a
 * terragrunt mock output.
 */
let cloudFrontClient: { send: jest.Mock };

function createInvalidationMocks(): { mocks: Parameters<typeof TestContainer.create>[0]['mocks'] } {
  cloudFrontClient = {
    send: jest.fn(async (command: unknown) =>
      command instanceof CreateInvalidationCommand ? { Invalidation: { Id: 'I000000000001' } } : {},
    ),
  };

  return { mocks: [{ metadata: { package: '@octo' }, type: CloudFrontClient, value: cloudFrontClient }] };
}

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
    const container = await TestContainer.create(createInvalidationMocks(), { factoryTimeoutInMs: 500 });

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
        { outputDir: PUBLIC_OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    /* eslint-disable spellcheck/spell-checker */
    expect(await TerragruntUtility.collectTerraformResources(PUBLIC_OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_s3_bucket.bucket-test-bucket_website_bucket",
       "aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config",
       "aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access",
       "aws_s3_bucket_policy.bucket-test-bucket_website_bucket_policy",
       "aws_s3_object.bucket-test-bucket_file_errorhtml",
       "aws_s3_object.bucket-test-bucket_file_indexhtml",
       "aws_s3_object.bucket-test-bucket_file_page1html",
     ]
    `);
    /* eslint-enable */
  }, 300_000);

  it('should generate terragrunt for a distribution that validates and plans against AWS', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsS3StaticWebsiteServiceModule>(
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: AWS_REGION_ID,
            bucketName: 'test-bucket-cloud-front',
            cloudFront: { notFoundBehavior: 'single-page-app', priceClass: 'PriceClass_100' },
            directoryPath: websiteSourcePath,
          },
          moduleId: 'service',
          type: AwsS3StaticWebsiteServiceModule,
        },
        { outputDir: CLOUD_FRONT_OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    /* eslint-disable spellcheck/spell-checker */
    expect(await TerragruntUtility.collectTerraformResources(CLOUD_FRONT_OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_s3_bucket.bucket-test-bucket-cloud-front_website_bucket",
       "aws_s3_bucket_public_access_block.bucket-test-bucket-cloud-front_website_bucket_public_access",
       "aws_s3_bucket_policy.bucket-test-bucket-cloud-front_website_bucket_policy",
       "aws_s3_object.bucket-test-bucket-cloud-front_file_errorhtml",
       "aws_s3_object.bucket-test-bucket-cloud-front_file_indexhtml",
       "aws_s3_object.bucket-test-bucket-cloud-front_file_page1html",
       "aws_cloudfront_origin_access_control.cloudfront-test-bucket-cloud-front_origin_access_control_testbucketcloudfrontorigin",
       "aws_cloudfront_distribution.cloudfront-test-bucket-cloud-front_distribution",
       "null_resource.cloudfront-invalidation-test-bucket-cloud-front",
     ]
    `);
    /* eslint-enable */
  }, 300_000);
});
