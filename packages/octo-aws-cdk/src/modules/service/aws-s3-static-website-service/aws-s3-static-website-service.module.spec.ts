import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { type Account, type App, DiffAssert, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsS3StaticWebsiteServiceModule } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

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
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform);
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
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['service'],
    });
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
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureS3WebsiteResponseResourceAction",
       ],
       [
         "CaptureS3WebsiteResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    /* eslint-disable spellcheck/spell-checker */
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_s3_bucket" "bucket-test-bucket_website_bucket" {
       provider = aws.123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_website_configuration" "bucket-test-bucket_website_bucket_config" {
       provider = aws.123-us-east-1
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
       provider = aws.123-us-east-1
       block_public_acls = false
       block_public_policy = false
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       ignore_public_acls = false
       restrict_public_buckets = false

       depends_on = [aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config]
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket_website_bucket_public_read_policy" {
       provider = aws.123-us-east-1
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
       provider = aws.123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("${websiteSourcePath}/error.html")
       key = "error.html"
       source = "${websiteSourcePath}/error.html"

       depends_on = [aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_indexhtml" {
       provider = aws.123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("${websiteSourcePath}/index.html")
       key = "index.html"
       source = "${websiteSourcePath}/index.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_errorhtml]
     }

     resource "aws_s3_object" "bucket-test-bucket_file_page1html" {
       provider = aws.123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket_website_bucket.id
       content_type = "text/html"
       etag = filemd5("${websiteSourcePath}/page-1.html")
       key = "page-1.html"
       source = "${websiteSourcePath}/page-1.html"

       depends_on = [aws_s3_object.bucket-test-bucket_file_indexhtml]
     }

     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket_website_bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
     }"
    `);
    /* eslint-enable */
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    /* eslint-disable spellcheck/spell-checker */
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.bucket-test-bucket-Arn | blocks: 0 | properties: 1",
       "+ output.bucket-test-bucket-awsRegionId | blocks: 0 | properties: 1",
       "+ resource.aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy | blocks: 0 | properties: 11",
       "+ resource.aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access | blocks: 0 | properties: 7",
       "+ resource.aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config | blocks: 2 | properties: 3",
       "+ resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 0 | properties: 2",
       "+ resource.aws_s3_object.bucket-test-bucket_file_errorhtml | blocks: 0 | properties: 7",
       "+ resource.aws_s3_object.bucket-test-bucket_file_indexhtml | blocks: 0 | properties: 7",
       "+ resource.aws_s3_object.bucket-test-bucket_file_page1html | blocks: 0 | properties: 7",
     ]
    `);
    /* eslint-enable */

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
    const resultUpdateNoChange = await testModuleContainer.commit(appUpdateNoChange, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateNoChange.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/s3-website=bucket-test-bucket",
     ]
    `);
    /* eslint-disable spellcheck/spell-checker */
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.bucket-test-bucket-Arn | blocks: 0 | properties: 1",
       "- output.bucket-test-bucket-awsRegionId | blocks: 0 | properties: 1",
       "- resource.aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy | blocks: 0 | properties: 11",
       "- resource.aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access | blocks: 0 | properties: 7",
       "- resource.aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config | blocks: 2 | properties: 3",
       "- resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 0 | properties: 2",
       "- resource.aws_s3_object.bucket-test-bucket_file_errorhtml | blocks: 0 | properties: 7",
       "- resource.aws_s3_object.bucket-test-bucket_file_indexhtml | blocks: 0 | properties: 7",
       "- resource.aws_s3_object.bucket-test-bucket_file_page1html | blocks: 0 | properties: 7",
     ]
    `);
    /* eslint-enable */

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-website=bucket-test-bucket",
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    /* eslint-disable spellcheck/spell-checker */
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.bucket-test-bucket-Arn | blocks: 0 | properties: 1",
       "+ output.bucket-test-bucket-awsRegionId | blocks: 0 | properties: 1",
       "+ resource.aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy | blocks: 0 | properties: 11",
       "+ resource.aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access | blocks: 0 | properties: 7",
       "+ resource.aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config | blocks: 2 | properties: 3",
       "+ resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 1 | properties: 2",
       "+ resource.aws_s3_object.bucket-test-bucket_file_errorhtml | blocks: 0 | properties: 7",
       "+ resource.aws_s3_object.bucket-test-bucket_file_indexhtml | blocks: 0 | properties: 7",
       "+ resource.aws_s3_object.bucket-test-bucket_file_page1html | blocks: 0 | properties: 7",
     ]
    `);
    /* eslint-enable */

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "~ resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 1 | properties: 0",
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
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "~ resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 1 | properties: 0",
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

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
        await testModuleContainer.commit(appUpdateRegionId, {
          enableResourceCapture: true,
        });
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

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
      const resultUpdateBucketName = await testModuleContainer.commit(appUpdateBucketName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateBucketName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "+ @octo/s3-website=bucket-changed-bucket",
         "- @octo/s3-website=bucket-test-bucket",
         "~ @octo/s3-website=bucket-changed-bucket",
       ]
      `);
      /* eslint-disable spellcheck/spell-checker */
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ output.bucket-changed-bucket-Arn | blocks: 0 | properties: 1",
         "+ output.bucket-changed-bucket-awsRegionId | blocks: 0 | properties: 1",
         "+ resource.aws_s3_bucket_policy.bucket-changed-bucket_website_bucket_public_read_policy | blocks: 0 | properties: 11",
         "+ resource.aws_s3_bucket_public_access_block.bucket-changed-bucket_website_bucket_public_access | blocks: 0 | properties: 7",
         "+ resource.aws_s3_bucket_website_configuration.bucket-changed-bucket_website_bucket_config | blocks: 2 | properties: 3",
         "+ resource.aws_s3_bucket.bucket-changed-bucket_website_bucket | blocks: 0 | properties: 2",
         "+ resource.aws_s3_object.bucket-changed-bucket_file_errorhtml | blocks: 0 | properties: 7",
         "+ resource.aws_s3_object.bucket-changed-bucket_file_indexhtml | blocks: 0 | properties: 7",
         "+ resource.aws_s3_object.bucket-changed-bucket_file_page1html | blocks: 0 | properties: 7",
         "- output.bucket-test-bucket-Arn | blocks: 0 | properties: 1",
         "- output.bucket-test-bucket-awsRegionId | blocks: 0 | properties: 1",
         "- resource.aws_s3_bucket_policy.bucket-test-bucket_website_bucket_public_read_policy | blocks: 0 | properties: 11",
         "- resource.aws_s3_bucket_public_access_block.bucket-test-bucket_website_bucket_public_access | blocks: 0 | properties: 7",
         "- resource.aws_s3_bucket_website_configuration.bucket-test-bucket_website_bucket_config | blocks: 2 | properties: 3",
         "- resource.aws_s3_bucket.bucket-test-bucket_website_bucket | blocks: 0 | properties: 2",
         "- resource.aws_s3_object.bucket-test-bucket_file_errorhtml | blocks: 0 | properties: 7",
         "- resource.aws_s3_object.bucket-test-bucket_file_indexhtml | blocks: 0 | properties: 7",
         "- resource.aws_s3_object.bucket-test-bucket_file_page1html | blocks: 0 | properties: 7",
       ]
      `);
      /* eslint-enable */
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

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
      const resultUpdateDirectoryPath = await testModuleContainer.commit(appUpdateDirectoryPath, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateDirectoryPath.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "~ @octo/s3-website=bucket-test-bucket",
       ]
      `);
      /* eslint-disable spellcheck/spell-checker */
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "- resource.aws_s3_object.bucket-test-bucket_file_errorhtml | blocks: 0 | properties: 7",
         "- resource.aws_s3_object.bucket-test-bucket_file_page1html | blocks: 0 | properties: 7",
         "~ resource.aws_s3_object.bucket-test-bucket_file_indexhtml | blocks: 0 | properties: 1",
       ]
      `);
      /* eslint-enable */
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
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

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
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/s3-website=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
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
