import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsS3StorageServiceModule } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

async function setup(
  testModuleContainer: TestModuleContainer,
  {
    awsRegionId = 'us-east-1',
    regionKind = 'networked',
  }: { awsRegionId?: string; regionKind?: 'networked' | 'none' | 'serverless' } = {},
): Promise<void> {
  const {
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  if (regionKind === 'networked') {
    region.addAnchor(
      testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
        'AwsRegionAnchor',
        {
          awsRegionAZs: [`${awsRegionId}a`],
          awsRegionId,
          regionId: `aws-${awsRegionId}a`,
          vpcCidrBlock: '10.0.0.0/16',
        },
        region,
      ),
    );
  } else if (regionKind === 'serverless') {
    region.addAnchor(
      testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
        'AwsServerlessRegionAnchor',
        { awsRegionId, regionId: 'region', serverless: true },
        region,
      ),
    );
  }
}

describe('AwsS3StorageServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

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
    const runModulesGenerator = testModuleContainer.runModules<AwsS3StorageServiceModule>(
      {
        inputs: {
          accessPrefixes: ['uploads'],
          bucketName: 'test-bucket',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      },
      { filterByModuleIds: ['service'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
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

     # service/outputs.tf
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
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsS3StorageServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    // Adding access prefixes should have no effect as they only create anchors.
    await setup(testModuleContainer);
    const addAccessPrefix = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              accessPrefixes: ['uploads'],
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(addAccessPrefix.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addAccessPrefix.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            hidden: true,
            inputs: {
              accessPrefixes: ['uploads'],
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/s3-storage=bucket-test-bucket",
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
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              accessPrefixes: ['uploads'],
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              accessPrefixes: ['uploads'],
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              accessPrefixes: ['uploads'],
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
  });

  describe('uploads', () => {
    it('should call correct actions', async () => {
      await setup(testModuleContainer, { regionKind: 'serverless' });
      const runModulesGenerator = testModuleContainer.runModules<AwsS3StorageServiceModule>(
        {
          inputs: {
            bucketName: 'test-bucket',
            directoryPath: websiteSourcePath,
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'service',
          type: AwsS3StorageServiceModule,
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

       resource "aws_s3_object" "bucket-test-bucket_file_errorhtml" {
         provider = aws._123-us-east-1
         bucket = aws_s3_bucket.bucket-test-bucket.id
         content_type = "text/html"
         etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html")
         key = "error.html"
         source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/error.html"
       }

       resource "aws_s3_object" "bucket-test-bucket_file_indexhtml" {
         provider = aws._123-us-east-1
         bucket = aws_s3_bucket.bucket-test-bucket.id
         content_type = "text/html"
         etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html")
         key = "index.html"
         source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/index.html"
       }

       resource "aws_s3_object" "bucket-test-bucket_file_page1html" {
         provider = aws._123-us-east-1
         bucket = aws_s3_bucket.bucket-test-bucket.id
         content_type = "text/html"
         etag = filemd5("\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html")
         key = "page-1.html"
         source = "\${var.OCTO_PROJECT_ROOT}/resources/s3-static-website/page-1.html"
       }

       # service/outputs.tf
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
           "AddAwsS3StorageServiceModelAction",
         ],
         [
           "UpdateAwsS3StorageServiceSourcePathsModelAction",
         ],
       ]
      `);
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "+ @octo/s3-storage=bucket-test-bucket",
         "* @octo/s3-storage=bucket-test-bucket",
       ]
      `);
    });

    it('should CUD', async () => {
      await setup(testModuleContainer, { regionKind: 'serverless' });
      const { resourceDiffs: resourceDiffsCreate } = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
       [
         "+ @octo/s3-storage=bucket-test-bucket",
         "* @octo/s3-storage=bucket-test-bucket",
       ]
      `);

      await setup(testModuleContainer, { regionKind: 'serverless' });
      const updateNoChange = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(updateNoChange.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(updateNoChange.resourceDiffs)).toMatchInlineSnapshot(`[]`);

      await setup(testModuleContainer, { regionKind: 'serverless' });
      const deleteResult = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              hidden: true,
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(deleteResult.hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/s3-storage=bucket-test-bucket",
       ]
      `);

      const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
      expect(isResourceStateEqual).toBe(true);
    });

    it('should handle region change', async () => {
      await setup(testModuleContainer, { regionKind: 'serverless' });
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
      await setup(testModuleContainer, { awsRegionId: 'us-west-2', regionKind: 'serverless' });
      // awsRegionId selects the provider; Bucket is force-new on aws_s3_bucket → octo emits a REPLACE.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath,
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/s3-storage=bucket-test-bucket",
       ]
      `);
    });

    it('should handle directoryPath change', async () => {
      await setup(testModuleContainer, { regionKind: 'serverless' });
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              bucketName: 'test-bucket',
              directoryPath: websiteSourcePath,
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer, { regionKind: 'serverless' });
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: websiteSourcePath + '/index.html',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-storage=bucket-test-bucket",
       ]
      `);
    });
  });

  describe('input changes', () => {
    it('should handle bucketName change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'changed-bucket',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/s3-storage=bucket-test-bucket",
         "+ @octo/s3-storage=bucket-changed-bucket",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsS3StorageServiceModule>(
        {
          inputs: {
            bucketName: 'test-bucket',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'service-1',
          type: AwsS3StorageServiceModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service-2',
            type: AwsS3StorageServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate bucketName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: '',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate accessPrefixes elements are not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                accessPrefixes: [''],
                bucketName: 'test-bucket',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "accessPrefixes" in schema could not be validated!"`);
    });

    it('should validate directoryPath is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                directoryPath: '',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "directoryPath" in schema could not be validated!"`);
    });

    it('should reject a region that is not an AWS region', async () => {
      await setup(testModuleContainer, { regionKind: 'none' });
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            {
              inputs: {
                bucketName: 'test-bucket',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Region is not an AWS region!"`);
    });
  });
});
