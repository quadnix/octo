import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StorageServiceModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
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
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsS3StorageServiceModule>(
      app,
      {
        inputs: {
          bucketName: 'test-bucket',
          region: stub('${{testModule.model.region}}'),
          remoteDirectoryPaths: ['uploads'],
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      },
      { filterByModuleIds: ['service'], skipTerraformApply: true },
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
     }

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     # service/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
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
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appCreate,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    // Adding directories should have no effect as they only create anchors.
    const { app: appAddDirectory } = await setup(testModuleContainer);
    const addDirectory = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appAddDirectory,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
              remoteDirectoryPaths: ['uploads'],
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(addDirectory.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addDirectory.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appDelete,
          {
            hidden: true,
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
              remoteDirectoryPaths: ['uploads'],
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
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
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appCreate,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
              remoteDirectoryPaths: ['uploads'],
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appUpdateTags,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
              remoteDirectoryPaths: ['uploads'],
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appDeleteTags,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
              remoteDirectoryPaths: ['uploads'],
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
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

  describe('input changes', () => {
    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appCreate,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            appUpdateBucketName,
            {
              inputs: {
                bucketName: 'changed-bucket',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { skipTerraformApply: true },
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsS3StorageServiceModule>(
        appCreate,
        {
          inputs: {
            bucketName: 'test-bucket',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'service-1',
          type: AwsS3StorageServiceModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsS3StorageServiceModule>(
          appUpdateModuleId,
          {
            inputs: {
              bucketName: 'test-bucket',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'service-2',
            type: AwsS3StorageServiceModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate bucketName is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            app,
            {
              inputs: {
                bucketName: '',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate remoteDirectoryPaths elements are not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsS3StorageServiceModule>(
            app,
            {
              inputs: {
                bucketName: 'test-bucket',
                region: stub('${{testModule.model.region}}'),
                remoteDirectoryPaths: [''],
              },
              moduleId: 'service',
              type: AwsS3StorageServiceModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "remoteDirectoryPaths" in schema could not be validated!"`,
      );
    });
  });
});
