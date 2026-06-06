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
import { AwsEfsFilesystemModule } from './index.js';

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

describe('AwsEfsFilesystemModule UT', () => {
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
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['filesystem'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEfsFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureEfsResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
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

     resource "aws_efs_file_system" "efs-region-test-filesystem" {
       provider = aws.123-us-east-1
       encrypted = false
       performance_mode = "generalPurpose"
       throughput_mode = "bursting"
       tags = {
         Name = "test-filesystem"
       }
     }

     resource "aws_efs_backup_policy" "efs-region-test-filesystem_backup_policy" {
       provider = aws.123-us-east-1
       backup_policy {
         status = "DISABLED"
       }
       file_system_id = aws_efs_file_system.efs-region-test-filesystem.id

       depends_on = [aws_efs_file_system.efs-region-test-filesystem]
     }

     output "efs-region-test-filesystem-FileSystemArn" {
       value = aws_efs_file_system.efs-region-test-filesystem.arn
     }

     output "efs-region-test-filesystem-FileSystemId" {
       value = aws_efs_file_system.efs-region-test-filesystem.id
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.efs-region-test-filesystem-FileSystemArn | blocks: 0 | properties: 1",
       "+ output.efs-region-test-filesystem-FileSystemId | blocks: 0 | properties: 1",
       "+ resource.aws_efs_backup_policy.efs-region-test-filesystem_backup_policy | blocks: 1 | properties: 3",
       "+ resource.aws_efs_file_system.efs-region-test-filesystem | blocks: 1 | properties: 4",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/efs=efs-region-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.efs-region-test-filesystem-FileSystemArn | blocks: 0 | properties: 1",
       "- output.efs-region-test-filesystem-FileSystemId | blocks: 0 | properties: 1",
       "- resource.aws_efs_backup_policy.efs-region-test-filesystem_backup_policy | blocks: 1 | properties: 3",
       "- resource.aws_efs_file_system.efs-region-test-filesystem | blocks: 1 | properties: 4",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.efs-region-test-filesystem-FileSystemArn | blocks: 0 | properties: 1",
       "+ output.efs-region-test-filesystem-FileSystemId | blocks: 0 | properties: 1",
       "+ resource.aws_efs_backup_policy.efs-region-test-filesystem_backup_policy | blocks: 1 | properties: 3",
       "+ resource.aws_efs_file_system.efs-region-test-filesystem | blocks: 1 | properties: 4",
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/efs=efs-region-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/efs=efs-region-test-filesystem",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle filesystemName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEfsFilesystemModule>({
        inputs: {
          filesystemName: 'test-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateFilesystemName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEfsFilesystemModule>({
        inputs: {
          filesystemName: 'changed-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      });
      const resultUpdateFilesystemName = await testModuleContainer.commit(appUpdateFilesystemName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateFilesystemName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "+ @octo/efs=efs-region-changed-filesystem",
         "- @octo/efs=efs-region-test-filesystem",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ output.efs-region-changed-filesystem-FileSystemArn | blocks: 0 | properties: 1",
         "+ output.efs-region-changed-filesystem-FileSystemId | blocks: 0 | properties: 1",
         "+ resource.aws_efs_backup_policy.efs-region-changed-filesystem_backup_policy | blocks: 1 | properties: 3",
         "+ resource.aws_efs_file_system.efs-region-changed-filesystem | blocks: 1 | properties: 4",
         "- output.efs-region-test-filesystem-FileSystemArn | blocks: 0 | properties: 1",
         "- output.efs-region-test-filesystem-FileSystemId | blocks: 0 | properties: 1",
         "- resource.aws_efs_backup_policy.efs-region-test-filesystem_backup_policy | blocks: 1 | properties: 3",
         "- resource.aws_efs_file_system.efs-region-test-filesystem | blocks: 1 | properties: 4",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem-1',
      type: AwsEfsFilesystemModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem-2',
      type: AwsEfsFilesystemModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate filesystemName length', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEfsFilesystemModule>({
          inputs: {
            filesystemName: '',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'filesystem',
          type: AwsEfsFilesystemModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "filesystemName" in schema could not be validated!"`);
    });
  });
});
