import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { jest } from '@jest/globals';
import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModule } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

/**
 * The CloudFront API the invalidation resource reaches for. An invalidation runs for real even in a
 * `skip` run - it is only terraform that such a run leaves out.
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
    account: ['aws,123'],
    app: ['test-app'],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );
}

describe('AwsS3StaticWebsiteServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(createInvalidationMocks(), { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsS3StaticWebsiteServiceModule>(
      {
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      },
      { filterByModuleIds: ['service'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    // eslint-disable-next-line spellcheck/spell-checker
    expect(hclRender).toMatchInlineSnapshot(`
     "# service/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     resource "aws_s3_bucket" "bucket-test-bucket_website_bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_website_configuration" "bucket-test-bucket_website_bucket_config" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       error_document {
         key = "error.html"
       }
       index_document {
         suffix = "index.html"
       }

       depends_on = [aws_s3_bucket.bucket-test-bucket_website_bucket]
     }

     resource "aws_s3_bucket_public_access_block" "bucket-test-bucket_website_bucket_public_access" {
       provider = aws._123-us-east-1
       block_public_acls = false
       block_public_policy = false
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       ignore_public_acls = false
       restrict_public_buckets = false

       depends_on = [aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config]
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket_website_bucket_policy" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject"]
             Effect = "Allow"
             Principal = "*"
             Resource = ["\${aws_s3_bucket.bucket-test-bucket_website_bucket.arn}/*"]
             Sid = "PublicReadGetObject"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_errorhtml" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html")
       key = "error.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html"

       depends_on = [aws_s3_bucket_policy.bucket-test-bucket_website_bucket_policy]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_indexhtml" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html")
       key = "index.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_errorhtml]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_page1html" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html")
       key = "page-1.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_indexhtml]
     }

     # service/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
     }

     output "bucket-test-bucket-RegionalDomainName" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.bucket_regional_domain_name
     }

     # service/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # service/variables.tf
     variable "OCTO_PROJECT_ROOT" {
       type = string
     }"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsS3StaticWebsiteServiceModelAction",
       ],
       [
         "UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  it('should call correct actions with cloudFront', async () => {
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsS3StaticWebsiteServiceModule>(
      {
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          cloudFront: {
            aliases: ['www.test-bucket.com'],
            certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test-certificate',
          },
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      },
      { filterByModuleIds: ['service'], terraformTarget: 'skip' },
    );

    const { hclRender, resourceDiffs } = (await runModulesGenerator.next()).value!;
    // eslint-disable-next-line spellcheck/spell-checker
    expect(hclRender).toMatchInlineSnapshot(`
     "# service/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
         external = {
           source = "hashicorp/external"
         }
         null = {
           source = "hashicorp/null"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     data "aws_cloudfront_cache_policy" "cloudfront-test-bucket_managed_cache_ManagedCachingOptimized" {
       name = "Managed-CachingOptimized"
       provider = aws._123-us-east-1
     }

     data "external" "cloudfront-invalidation-test-bucket" {
       program = ["octo", "get-response", "--resourceId=cloudfront-invalidation-test-bucket"]
       depends_on = [null_resource.cloudfront-invalidation-test-bucket]
     }

     resource "aws_s3_bucket" "bucket-test-bucket_website_bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_public_access_block" "bucket-test-bucket_website_bucket_public_access" {
       provider = aws._123-us-east-1
       block_public_acls = true
       block_public_policy = true
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       ignore_public_acls = true
       restrict_public_buckets = true

       depends_on = [aws_s3_bucket.bucket-test-bucket_website_bucket]
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket_website_bucket_policy" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject"]
             Condition = {
               StringEquals = {
                 "AWS:SourceArn" = aws_cloudfront_distribution.cloudfront-test-bucket_distribution.arn
               }
             }
             Effect = "Allow"
             Principal = {
               Service = "cloudfront.amazonaws.com"
             }
             Resource = ["\${aws_s3_bucket.bucket-test-bucket_website_bucket.arn}/*"]
             Sid = "AllowCloudFrontReadcloudfronttestbucket"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_errorhtml" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html")
       key = "error.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html"

       depends_on = [aws_s3_bucket_policy.bucket-test-bucket_website_bucket_policy]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_indexhtml" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html")
       key = "index.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_errorhtml]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_page1html" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html")
       key = "page-1.html"
       source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_indexhtml]
     }

     resource "aws_cloudfront_origin_access_control" "cloudfront-test-bucket_origin_access_control_testbucketorigin" {
       provider = aws._123-us-east-1
       name = "cloudfront-test-bucket-test-bucket-origin"
       origin_access_control_origin_type = "s3"
       signing_behavior = "always"
       signing_protocol = "sigv4"
     }

     resource "aws_cloudfront_distribution" "cloudfront-test-bucket_distribution" {
       provider = aws._123-us-east-1
       aliases = ["www.test-bucket.com"]
       comment = "www.test-bucket.com"
       custom_error_response {
         error_caching_min_ttl = 10
         error_code = 403
         response_code = 404
         response_page_path = "/error.html"
       }
       custom_error_response {
         error_caching_min_ttl = 10
         error_code = 404
         response_code = 404
         response_page_path = "/error.html"
       }
       default_cache_behavior {
         allowed_methods = ["GET", "HEAD"]
         cache_policy_id = data.aws_cloudfront_cache_policy.cloudfront-test-bucket_managed_cache_ManagedCachingOptimized.id
         cached_methods = ["GET", "HEAD"]
         compress = true
         target_origin_id = "test-bucket-origin"
         viewer_protocol_policy = "redirect-to-https"
       }
       default_root_object = "index.html"
       enabled = true
       http_version = "http2and3"
       is_ipv6_enabled = true
       origin {
         connection_attempts = 3
         connection_timeout = 10
         origin_access_control_id = aws_cloudfront_origin_access_control.cloudfront-test-bucket_origin_access_control_testbucketorigin.id
         domain_name = "test-bucket.s3.us-east-1.amazonaws.com"
         origin_id = "test-bucket-origin"
       }
       price_class = "PriceClass_All"
       restrictions {
         geo_restriction {
           restriction_type = "none"
         }
       }
       viewer_certificate {
         acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/test-certificate"
         minimum_protocol_version = "TLSv1.2_2021"
         ssl_support_method = "sni-only"
       }

       depends_on = [aws_cloudfront_origin_access_control.cloudfront-test-bucket_origin_access_control_testbucketorigin]
     }

     resource "null_resource" "cloudfront-invalidation-test-bucket" {
       triggers = {
         octo_properties_hash = "ae45c2b008a50fe1"
         input_cloudfront_test_bucket_Arn = "\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.arn}"
         input_cloudfront_test_bucket_DistributionId = "\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.id}"
         input_cloudfront_test_bucket_DomainName = "\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.domain_name}"
         input_cloudfront_test_bucket_HostedZoneId = "\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.hosted_zone_id}"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=cloudfront-invalidation-test-bucket --input cloudfront-test-bucket.Arn=\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.arn} --input cloudfront-test-bucket.DistributionId=\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.id} --input cloudfront-test-bucket.DomainName=\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.domain_name} --input cloudfront-test-bucket.HostedZoneId=\${aws_cloudfront_distribution.cloudfront-test-bucket_distribution.hosted_zone_id}"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=cloudfront-invalidation-test-bucket --input cloudfront-test-bucket.Arn=\${self.triggers.input_cloudfront_test_bucket_Arn} --input cloudfront-test-bucket.DistributionId=\${self.triggers.input_cloudfront_test_bucket_DistributionId} --input cloudfront-test-bucket.DomainName=\${self.triggers.input_cloudfront_test_bucket_DomainName} --input cloudfront-test-bucket.HostedZoneId=\${self.triggers.input_cloudfront_test_bucket_HostedZoneId}"
       }

       depends_on = [aws_cloudfront_origin_access_control.cloudfront-test-bucket_origin_access_control_testbucketorigin, aws_cloudfront_distribution.cloudfront-test-bucket_distribution]
     }

     # service/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
     }

     output "bucket-test-bucket-RegionalDomainName" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.bucket_regional_domain_name
     }

     output "cloudfront-test-bucket-Arn" {
       value = aws_cloudfront_distribution.cloudfront-test-bucket_distribution.arn
     }

     output "cloudfront-test-bucket-DistributionId" {
       value = aws_cloudfront_distribution.cloudfront-test-bucket_distribution.id
     }

     output "cloudfront-test-bucket-DomainName" {
       value = aws_cloudfront_distribution.cloudfront-test-bucket_distribution.domain_name
     }

     output "cloudfront-test-bucket-HostedZoneId" {
       value = aws_cloudfront_distribution.cloudfront-test-bucket_distribution.hosted_zone_id
     }

     output "cloudfront-invalidation-test-bucket" {
       value = data.external.cloudfront-invalidation-test-bucket.result
     }

     # service/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # service/variables.tf
     variable "OCTO_PROJECT_ROOT" {
       type = string
     }"
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
       "+ @octo/cloudfront-distribution=cloudfront-test-bucket",
       "+ @octo/cloudfront-invalidation=cloudfront-invalidation-test-bucket",
     ]
    `);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    await setup(testModuleContainer);
    const updateNoChange = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateNoChange.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateNoChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            hidden: true,
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle awsRegionId change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
      await setup(testModuleContainer);
      // awsRegionId selects the provider; Bucket is force-new on aws_s3_bucket → octo emits a REPLACE.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-west-2',
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });

    it('should not invalidate the edge caches when nothing was published', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              cloudFront: {},
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();
      cloudFrontClient.send.mockClear();

      // The website model rebuilds the whole manifest on every run, so the source paths always
      // report an update and the action that owns the content version always runs. What the
      // invalidation reacts to is the version that action arrives at, and re-reading unchanged files
      // arrives at the same one - so a run that publishes nothing new invalidates nothing.
      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                cloudFront: {},
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
      expect(cloudFrontClient.send).not.toHaveBeenCalled();
    });

    it('should invalidate the edge caches when the published files change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              cloudFront: {},
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();
      cloudFrontClient.send.mockClear();

      // Publishing one file instead of three is a different site, so what the edges are holding is
      // stale.
      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                cloudFront: {},
                directoryPath: websiteSourcePath,
                subDirectoryOrFilePath: 'index.html',
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      // The invalidation is replaced rather than updated: one that already ran cannot be edited.
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/cloudfront-invalidation=cloudfront-invalidation-test-bucket",
         "* @octo/s3-website=bucket-test-bucket",
       ]
      `);
      expect(cloudFrontClient.send).toHaveBeenCalledTimes(1);
      const invalidationInput = (cloudFrontClient.send.mock.calls[0][0] as CreateInvalidationCommand).input;
      expect(invalidationInput.InvalidationBatch!.Paths).toEqual({ Items: ['/*'], Quantity: 1 });
      // The caller reference carries the digest of what is published, so AWS cannot answer this call
      // with the invalidation the previous deploy asked for.
      expect(invalidationInput.InvalidationBatch!.CallerReference).toMatch(
        /^cloudfront-invalidation-test-bucket-[0-9a-f]{40}$/,
      );
    });

    it('should handle notFoundBehavior change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              cloudFront: {},
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                cloudFront: { notFoundBehavior: 'single-page-app' },
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;

      // A miss now answers 200 with the index document instead of 404 with the error document, and
      // the distribution is edited in place rather than rebuilt.
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/cloudfront-distribution=cloudfront-test-bucket",
         "* @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });

    it('should handle bucketName change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'changed-bucket',
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/s3-website=bucket-test-bucket",
         "+ @octo/s3-website=bucket-changed-bucket",
         "* @octo/s3-website=bucket-changed-bucket",
       ]
      `);
    });

    it('should handle cloudFront change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                cloudFront: {},
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-website=bucket-test-bucket",
         "* @octo/s3-website=bucket-test-bucket",
         "+ @octo/cloudfront-distribution=cloudfront-test-bucket",
         "+ @octo/cloudfront-invalidation=cloudfront-invalidation-test-bucket",
       ]
      `);
    });

    it('should handle directoryPath change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath + '/index.html',
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsS3StaticWebsiteServiceModule>(
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: 'us-east-1',
            bucketName: 'test-bucket',
            directoryPath: websiteSourcePath,
          },
          moduleId: 'service-1',
          type: AwsS3StaticWebsiteServiceModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              awsRegionId: 'us-east-1',
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
            },
            moduleId: 'service-2',
            type: AwsS3StaticWebsiteServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate awsRegionId is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: '',
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "awsRegionId" in schema could not be validated!"`);
    });

    it('should validate bucketName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: '',
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate an alias requires a certificate', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                cloudFront: { aliases: ['www.test-bucket.com'] },
                directoryPath: websiteSourcePath,
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"A CloudFront certificate is required to serve an alias!"`);
    });

    it('should validate directoryPath is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                awsRegionId: 'us-east-1',
                bucketName: 'test-bucket',
                directoryPath: '',
              },
              moduleId: 'service',
              type: AwsS3StaticWebsiteServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "directoryPath" in schema could not be validated!"`);
    });
  });
});
