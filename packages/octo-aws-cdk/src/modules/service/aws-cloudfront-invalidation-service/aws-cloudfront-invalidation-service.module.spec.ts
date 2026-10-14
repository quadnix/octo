import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { jest } from '@jest/globals';
import { Service, ServiceType, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsCloudFrontAnchorSchema } from '../../../anchors/aws-cloudfront/aws-cloudfront.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import type { InvalidationDistributionSchema } from '../../../resources/cloudfront-invalidation/index.schema.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { AwsCloudFrontInvalidationServiceModule } from './index.js';

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

async function setup(
  testModuleContainer: TestModuleContainer,
  { contentDigest = 'digest-1', servedBucketName = 'test-bucket' } = {},
): Promise<void> {
  const {
    account: [account],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  // Add the distribution.
  const {
    service: [cloudFront],
  } = await testModuleContainer.createTestModels('distribution', {
    service: [new Service('test-distribution-cloudfront', [account], ServiceType.GATEWAY, 'cloudfront')],
  });
  const cloudFrontAnchor = testModuleContainer.createTestAnchor<AwsCloudFrontAnchorSchema>(
    'AwsCloudFrontAnchor',
    { awsAccountId: '123', distributionName: 'test-distribution' },
    cloudFront,
  );
  cloudFront.addAnchor(cloudFrontAnchor);

  // Add the bucket.
  const {
    service: [content],
  } = await testModuleContainer.createTestModels('content', {
    service: [new Service('test-bucket-s3-storage', [region], ServiceType.STORAGE, 's3')],
  });
  const contentAnchor = testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
    'AwsS3StorageServiceAnchor',
    { awsAccountId: '123', awsRegionId: 'us-east-1', bucketName: 'test-bucket', contentDigest },
    content,
  );
  content.addAnchor(contentAnchor);

  // Add the distribution serving a bucket.
  await testModuleContainer.createTestOverlays('distribution', [
    {
      anchors: [cloudFrontAnchor, contentAnchor],
      context: `@octo/aws-cloudfront-s3-origin-overlay=aws-cloudfront-s3-origin-overlay-test-distribution-${servedBucketName}`,
      properties: { bucketName: servedBucketName },
    },
  ]);

  await testModuleContainer.createTestResources<[InvalidationDistributionSchema]>(
    'distribution',
    [
      {
        properties: { distributionName: 'test-distribution' } as any,
        resourceContext: '@octo/cloudfront-distribution=cloudfront-test-distribution',
        response: { DistributionId: 'E000000000001' },
        terraform: true,
      },
    ],
    { save: true },
  );
  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    blockPublicAccess: true,
    Bucket: 'test-bucket',
    lifecycleRules: [],
    permissions: [],
  });
  await testModuleContainer.createResources('content', [s3Storage], { save: true });
}

function invalidationModule(): any {
  return {
    inputs: { cloudFront: stub('${{distribution.model.service}}'), source: stub('${{content.model.service}}') },
    moduleId: 'invalidation',
    type: AwsCloudFrontInvalidationServiceModule,
  };
}

describe('AwsCloudFrontInvalidationServiceModule UT', () => {
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
    const { hclRender, modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), {
          filterByModuleIds: ['invalidation'],
          terraformTarget: 'skip',
        })
        .next()
    ).value!;

    expect(hclRender).toMatchInlineSnapshot(`
     "# content/main.tf
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

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_public_access_block" "bucket-test-bucket-public-access" {
       provider = aws._123-us-east-1
       block_public_acls = true
       block_public_policy = true
       bucket = aws_s3_bucket.bucket-test-bucket.id
       ignore_public_acls = true
       restrict_public_buckets = true

       depends_on = [aws_s3_bucket.bucket-test-bucket]
     }

     # content/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
     }

     output "bucket-test-bucket-Bucket" {
       value = aws_s3_bucket.bucket-test-bucket.id
     }

     output "bucket-test-bucket-RegionalDomainName" {
       value = aws_s3_bucket.bucket-test-bucket.bucket_regional_domain_name
     }

     # content/terragrunt.hcl
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

     # content/variables.tf
     <empty>

     # distribution/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # distribution/outputs.tf
     output "cloudfront-test-distribution-DistributionId" {
       value = "E000000000001"
     }

     # distribution/terragrunt.hcl
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

     # distribution/variables.tf
     <empty>

     # invalidation/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         external = {
           source = "hashicorp/external"
         }
         null = {
           source = "hashicorp/null"
         }
       }
     }

     data "external" "cloudfront-invalidation-test-distribution-test-bucket-51fb32" {
       program = ["octo", "get-response", "--resourceId=cloudfront-invalidation-test-distribution-test-bucket-51fb32"]
       depends_on = [null_resource.cloudfront-invalidation-test-distribution-test-bucket-51fb32]
     }

     resource "null_resource" "cloudfront-invalidation-test-distribution-test-bucket-51fb32" {
       triggers = {
         octo_properties_hash = "2b1b7260c29279e1"
         input_cloudfront_test_distribution_DistributionId = "\${var.cloudfront_test_distribution_DistributionId}"
         input_bucket_test_bucket_Arn = "\${var.bucket_test_bucket_Arn}"
         input_bucket_test_bucket_awsRegionId = "\${var.bucket_test_bucket_awsRegionId}"
         input_bucket_test_bucket_Bucket = "\${var.bucket_test_bucket_Bucket}"
         input_bucket_test_bucket_RegionalDomainName = "\${var.bucket_test_bucket_RegionalDomainName}"
       }
       provisioner "local-exec" {
         command = "octo run-action --resourceId=cloudfront-invalidation-test-distribution-test-bucket-51fb32 --input cloudfront-test-distribution.DistributionId=\${var.cloudfront_test_distribution_DistributionId} --input bucket-test-bucket.Arn=\${var.bucket_test_bucket_Arn} --input bucket-test-bucket.awsRegionId=\${var.bucket_test_bucket_awsRegionId} --input bucket-test-bucket.Bucket=\${var.bucket_test_bucket_Bucket} --input bucket-test-bucket.RegionalDomainName=\${var.bucket_test_bucket_RegionalDomainName}"
       }
       provisioner "local-exec" {
         when = destroy
         command = "octo run-action --resourceId=cloudfront-invalidation-test-distribution-test-bucket-51fb32 --input cloudfront-test-distribution.DistributionId=\${self.triggers.input_cloudfront_test_distribution_DistributionId} --input bucket-test-bucket.Arn=\${self.triggers.input_bucket_test_bucket_Arn} --input bucket-test-bucket.awsRegionId=\${self.triggers.input_bucket_test_bucket_awsRegionId} --input bucket-test-bucket.Bucket=\${self.triggers.input_bucket_test_bucket_Bucket} --input bucket-test-bucket.RegionalDomainName=\${self.triggers.input_bucket_test_bucket_RegionalDomainName}"
       }
     }

     # invalidation/outputs.tf
     output "cloudfront-invalidation-test-distribution-test-bucket-51fb32" {
       value = data.external.cloudfront-invalidation-test-distribution-test-bucket-51fb32.result
     }

     # invalidation/terragrunt.hcl
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

     dependency "content" {
       config_path = "../content"

       mock_outputs = {
         "bucket-test-bucket-Arn" = "arn:aws:s3:::mock-bucket"
         "bucket-test-bucket-Bucket" = "mock-bucket"
         "bucket-test-bucket-RegionalDomainName" = "mock-bucket.s3.us-east-1.amazonaws.com"
         "bucket-test-bucket-awsRegionId" = "us-east-1"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     dependency "distribution" {
       config_path = "../distribution"

       mock_outputs = {
         "cloudfront-test-distribution-DistributionId" = "mock-cloudfront-test-distribution-DistributionId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     inputs = {
       bucket_test_bucket_Arn = dependency.content.outputs["bucket-test-bucket-Arn"]
       bucket_test_bucket_awsRegionId = dependency.content.outputs["bucket-test-bucket-awsRegionId"]
       bucket_test_bucket_Bucket = dependency.content.outputs["bucket-test-bucket-Bucket"]
       bucket_test_bucket_RegionalDomainName = dependency.content.outputs["bucket-test-bucket-RegionalDomainName"]
       cloudfront_test_distribution_DistributionId = dependency.distribution.outputs["cloudfront-test-distribution-DistributionId"]
     }

     # invalidation/variables.tf
     variable "bucket_test_bucket_Arn" {}

     variable "bucket_test_bucket_awsRegionId" {}

     variable "bucket_test_bucket_Bucket" {}

     variable "bucket_test_bucket_RegionalDomainName" {}

     variable "cloudfront_test_distribution_DistributionId" {}"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsCloudFrontInvalidationOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/cloudfront-invalidation=cloudfront-invalidation-test-distribution-test-bucket-51fb32",
     ]
    `);
  });

  describe('input changes', () => {
    it('should invalidate only when the source files change', async () => {
      await setup(testModuleContainer, { contentDigest: 'digest-1' });
      await testModuleContainer
        .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), { terraformTarget: 'skip' })
        .next();

      await setup(testModuleContainer, { contentDigest: 'digest-1' });
      const unchanged = (
        await testModuleContainer
          .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), {
            filterByModuleIds: ['invalidation'],
            terraformTarget: 'skip',
          })
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(unchanged.resourceDiffs)).toEqual([]);

      await setup(testModuleContainer, { contentDigest: 'digest-2' });
      const changed = (
        await testModuleContainer
          .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), {
            filterByModuleIds: ['invalidation'],
            terraformTarget: 'skip',
          })
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(changed.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/cloudfront-invalidation=cloudfront-invalidation-test-distribution-test-bucket-51fb32",
       ]
      `);
    });

    it('should drop the invalidation when the module is removed', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), { terraformTarget: 'skip' })
        .next();

      await setup(testModuleContainer);
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsCloudFrontInvalidationServiceModule>([], { terraformTarget: 'skip' })
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/cloudfront-invalidation=cloudfront-invalidation-test-distribution-test-bucket-51fb32",
       ]
      `);
    });
  });

  describe('validation', () => {
    it('should reject a bucket the distribution does not serve', async () => {
      await setup(testModuleContainer, { servedBucketName: 'other-bucket' });

      await expect(
        testModuleContainer
          .runModules<AwsCloudFrontInvalidationServiceModule>(invalidationModule(), { terraformTarget: 'skip' })
          .next(),
      ).rejects.toThrow('Bucket "test-bucket" is not served by distribution "test-distribution"!');
    });
  });
});
