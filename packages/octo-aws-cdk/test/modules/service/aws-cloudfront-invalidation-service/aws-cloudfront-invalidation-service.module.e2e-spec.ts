import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { jest } from '@jest/globals';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsCloudFrontInvalidationServiceModule } from '../../../../src/modules/service/aws-cloudfront-invalidation-service/index.js';
import { AwsCloudFrontServiceModule } from '../../../../src/modules/service/aws-cloudfront-service/index.js';
import { AwsS3StorageServiceModule } from '../../../../src/modules/service/aws-s3-storage-service/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');
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
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    region: ['region'],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>(
      'AwsAccountAnchor',
      { awsAccountId: AWS_ACCOUNT_ID },
      account,
    ),
  );
  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
      'AwsServerlessRegionAnchor',
      { awsRegionId: AWS_REGION_ID, regionId: 'region', serverless: true },
      region,
    ),
  );
}

describe('AwsCloudFrontInvalidationServiceModule E2E', () => {
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

  it('should generate terragrunt for an invalidation after the upload that plans against AWS', async () => {
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule | AwsCloudFrontServiceModule | AwsCloudFrontInvalidationServiceModule>(
          [
            {
              inputs: {
                bucketName: 'test-invalidated-content',
                directoryPath: websiteSourcePath,
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'content',
              type: AwsS3StorageServiceModule,
            },
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                defaultRootObject: 'index.html',
                distributionName: 'test-invalidated-distribution',
                origins: [{ originId: 'site', source: stub('${{content.model.service}}') }],
                priceClass: 'PriceClass_100',
                routes: [{ originId: 'site' }],
              },
              moduleId: 'distribution',
              type: AwsCloudFrontServiceModule,
            },
            {
              inputs: {
                cloudFront: stub('${{distribution.model.service}}'),
                source: stub('${{content.model.service}}'),
              },
              moduleId: 'invalidation',
              type: AwsCloudFrontInvalidationServiceModule,
            },
          ],
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(Object.keys(HclUtility.parse(hclRender).resource)).toMatchInlineSnapshot(`
     [
       "aws_s3_bucket.bucket-test-invalidated-content-238572",
       "aws_s3_bucket_public_access_block.bucket-test-invalidated-content-238572-public-access",
       "aws_s3_bucket_policy.bucket-test-invalidated-content-238572-policy",
       "aws_s3_object.bucket-test-invalidated-content-238572_file_errorhtml",
       "aws_s3_object.bucket-test-invalidated-content-238572_file_indexhtml",
       "aws_s3_object.bucket-test-invalidated-content-238572_file_page1html",
       "aws_cloudfront_origin_access_control.cloudfront-test-invalidated-distribution-bbdcf0_origin_access_control_site",
       "aws_cloudfront_distribution.cloudfront-test-invalidated-distribution-bbdcf0_distribution",
       "null_resource.cloudfront-invalidation-test-invalidated-distribution-test-invalidated-content-238572",
     ]
    `);
  }, 300_000);
});
