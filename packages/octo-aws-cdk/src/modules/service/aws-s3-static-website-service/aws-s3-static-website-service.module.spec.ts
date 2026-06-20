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
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });

    expect(toRelativePaths(await testModuleContainer.renderHcl(app))).toMatchInlineSnapshot(`
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
     <empty>

     # service/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['service'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsS3StaticWebsiteServiceModelAction",
       ],
       [
         "UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appUpdateNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    expect(toRelativePaths(await testModuleContainer.diffHcl(appUpdateNoChange))).toMatchSnapshot();
    const resultUpdateNoChange = await testModuleContainer.commit(appUpdateNoChange);
    expect(testModuleContainer.digestDiffs(resultUpdateNoChange.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(toRelativePaths(await testModuleContainer.diffHcl(appDelete))).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
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
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    expect(toRelativePaths(await testModuleContainer.diffHcl(appUpdateTags))).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service',
      type: AwsS3StaticWebsiteServiceModule,
    });
    expect(toRelativePaths(await testModuleContainer.diffHcl(appDeleteTags))).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle awsRegionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');
      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-west-2',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateRegionId);
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update S3 Website immutable properties once it has been created!"`,
      );
    });

    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'changed-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      expect(toRelativePaths(await testModuleContainer.diffHcl(appUpdateBucketName))).toMatchSnapshot();
      const resultUpdateBucketName = await testModuleContainer.commit(appUpdateBucketName);
      expect(testModuleContainer.digestDiffs(resultUpdateBucketName.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/s3-website=bucket-test-bucket",
         "+ @octo/s3-website=bucket-changed-bucket",
         "* @octo/s3-website=bucket-changed-bucket",
       ]
      `);
    });

    it('should handle directoryPath change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath,
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateDirectoryPath } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          awsRegionId: 'us-east-1',
          bucketName: 'test-bucket',
          directoryPath: websiteSourcePath + '/index.html',
        },
        moduleId: 'service',
        type: AwsS3StaticWebsiteServiceModule,
      });
      expect(toRelativePaths(await testModuleContainer.diffHcl(appUpdateDirectoryPath))).toMatchSnapshot();
      const resultUpdateDirectoryPath = await testModuleContainer.commit(appUpdateDirectoryPath);
      expect(testModuleContainer.digestDiffs(resultUpdateDirectoryPath.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-website=bucket-test-bucket",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service-1',
      type: AwsS3StaticWebsiteServiceModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        awsRegionId: 'us-east-1',
        bucketName: 'test-bucket',
        directoryPath: websiteSourcePath,
      },
      moduleId: 'service-2',
      type: AwsS3StaticWebsiteServiceModule,
    });
    expect(toRelativePaths(await testModuleContainer.diffHcl(appUpdateModuleId))).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-website=bucket-test-bucket",
     ]
    `);
  });

  describe('validation', () => {
    it('should validate awsRegionId is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: '',
            bucketName: 'test-bucket',
            directoryPath: websiteSourcePath,
          },
          moduleId: 'service',
          type: AwsS3StaticWebsiteServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "awsRegionId" in schema could not be validated!"`);
    });

    it('should validate bucketName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: 'us-east-1',
            bucketName: '',
            directoryPath: websiteSourcePath,
          },
          moduleId: 'service',
          type: AwsS3StaticWebsiteServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate directoryPath is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsS3StaticWebsiteServiceModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            awsRegionId: 'us-east-1',
            bucketName: 'test-bucket',
            directoryPath: '',
          },
          moduleId: 'service',
          type: AwsS3StaticWebsiteServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "directoryPath" in schema could not be validated!"`);
    });
  });
});
