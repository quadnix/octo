import {
  type Account,
  type App,
  DiffAssert,
  type Region,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
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
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['service'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsS3StorageServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureS3StorageResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);
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

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws.123-us-east-1
       bucket = "test-bucket"
     }

     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    // Adding directories should have no effect as they only create anchors.
    const { app: appAddDirectory } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultAddDirectory = await testModuleContainer.commit(appAddDirectory, { enableResourceCapture: true });
    expect(new DiffAssert(resultAddDirectory.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/s3-storage=bucket-test-bucket",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle bucketName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StorageServiceModule>({
        inputs: {
          bucketName: 'test-bucket',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateBucketName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsS3StorageServiceModule>({
        inputs: {
          bucketName: 'changed-bucket',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'service',
        type: AwsS3StorageServiceModule,
      });
      const resultUpdateBucketName = await testModuleContainer.commit(appUpdateBucketName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateBucketName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "- @octo/s3-storage=bucket-test-bucket",
         "+ @octo/s3-storage=bucket-changed-bucket",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service-1',
      type: AwsS3StorageServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'service-2',
      type: AwsS3StorageServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('validation', () => {
    it('should validate bucketName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsS3StorageServiceModule>({
          inputs: {
            bucketName: '',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'service',
          type: AwsS3StorageServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "bucketName" in schema could not be validated!"`);
    });

    it('should validate remoteDirectoryPaths elements are not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsS3StorageServiceModule>({
          inputs: {
            bucketName: 'test-bucket',
            region: stub('${{testModule.model.region}}'),
            remoteDirectoryPaths: [''],
          },
          moduleId: 'service',
          type: AwsS3StorageServiceModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "remoteDirectoryPaths" in schema could not be validated!"`,
      );
    });
  });
});
