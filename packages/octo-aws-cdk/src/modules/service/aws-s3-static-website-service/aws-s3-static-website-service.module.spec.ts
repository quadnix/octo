import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsS3StaticWebsiteServiceModule } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

const toRelativePaths = (hcl: string): string => hcl.replaceAll(resourcesPath, 'resources');

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  return { account, app };
}

describe('AwsS3StaticWebsiteServiceModule UT', () => {
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
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsS3StaticWebsiteServiceModule>(
      app,
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
      { filterByModuleIds: ['service'], skipTerraformApply: true },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(toRelativePaths(hclRender)).toMatchInlineSnapshot(`
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

     resource "aws_s3_bucket_policy" "bucket-test-bucket_website_bucket_public_read_policy" {
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
       etag = filemd5("resources/s3-static-website/error.html")
       key = "error.html"
       source = "resources/s3-static-website/error.html"

       depends_on = [aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_indexhtml" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("resources/s3-static-website/index.html")
       key = "index.html"
       source = "resources/s3-static-website/index.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_errorhtml]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_page1html" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("resources/s3-static-website/page-1.html")
       key = "page-1.html"
       source = "resources/s3-static-website/page-1.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_indexhtml]
     }

     # service/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
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

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appCreate,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appUpdateNoChange } = await setup(testModuleContainer);
    const updateNoChange = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appUpdateNoChange,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(toRelativePaths(updateNoChange.hclDiff)).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateNoChange.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appDelete,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(toRelativePaths(deleteResult.hclDiff)).toMatchSnapshot();
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
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appCreate,
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
          { skipTerraformApply: true },
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
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appUpdateTags,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(toRelativePaths(updateTags.hclDiff)).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appDeleteTags,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(toRelativePaths(deleteTags.hclDiff)).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle awsRegionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appCreate,
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
          { skipTerraformApply: true },
        )
        .next();

      testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      // awsRegionId selects the provider; Bucket is force-new on aws_s3_bucket → octo emits a REPLACE.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            appUpdateRegionId,
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
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });

    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appCreate,
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
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            appUpdateBucketName,
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
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(toRelativePaths(hclDiff)).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/s3-website=bucket-test-bucket",
         "+ @octo/s3-website=bucket-changed-bucket",
         "* @octo/s3-website=bucket-changed-bucket",
       ]
      `);
    });

    it('should handle directoryPath change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appCreate,
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
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateDirectoryPath } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            appUpdateDirectoryPath,
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
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(toRelativePaths(hclDiff)).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsS3StaticWebsiteServiceModule>(
        appCreate,
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
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsS3StaticWebsiteServiceModule>(
          appUpdateModuleId,
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
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(toRelativePaths(hclDiff)).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  describe('validation', () => {
    it('should validate awsRegionId is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            app,
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
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "awsRegionId" in schema could not be validated!"`);
    });

    it('should validate bucketName is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            app,
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
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate directoryPath is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StaticWebsiteServiceModule>(
            app,
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
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "directoryPath" in schema could not be validated!"`);
    });
  });
});
