import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsCloudFrontServiceModule } from '../../../../src/modules/service/aws-cloudfront-service/index.js';
import { AwsS3StorageServiceModule } from '../../../../src/modules/service/aws-s3-storage-service/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'static-content');
const websiteSourcePath = join(__dirname, '../../../../resources', 's3-static-website');

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

describe('AwsCloudFrontServiceModule E2E', () => {
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

  it('should generate terragrunt for a closed bucket behind a distribution that plans against AWS', async () => {
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule | AwsCloudFrontServiceModule>(
          [
            {
              inputs: {
                bucketName: 'test-static-content',
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
                distributionName: 'test-distribution',
                errorResponses: [{ errorCode: 403, responseCode: 404, responsePagePath: '/error.html' }],
                origins: [{ originId: 'site', source: stub('${{content.model.service}}') }],
                priceClass: 'PriceClass_100',
                routes: [{ originId: 'site' }],
              },
              moduleId: 'distribution',
              type: AwsCloudFrontServiceModule,
            },
          ],
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(Object.keys(HclUtility.parse(hclRender).resource)).toMatchInlineSnapshot(`
     [
       "aws_s3_bucket.bucket-test-static-content-238572",
       "aws_s3_bucket_public_access_block.bucket-test-static-content-238572-public-access",
       "aws_s3_bucket_policy.bucket-test-static-content-238572-policy",
       "aws_s3_object.bucket-test-static-content-238572_file_errorhtml",
       "aws_s3_object.bucket-test-static-content-238572_file_indexhtml",
       "aws_s3_object.bucket-test-static-content-238572_file_page1html",
       "aws_cloudfront_origin_access_control.cloudfront-test-distribution-bbdcf0_origin_access_control_site",
       "aws_cloudfront_distribution.cloudfront-test-distribution-bbdcf0_distribution",
     ]
    `);
  }, 300_000);
});
