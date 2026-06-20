import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
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
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
     "# filesystem/main.tf
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

     # filesystem/outputs.tf
     output "efs-region-test-filesystem-FileSystemArn" {
       value = aws_efs_file_system.efs-region-test-filesystem.arn
     }

     output "efs-region-test-filesystem-FileSystemId" {
       value = aws_efs_file_system.efs-region-test-filesystem.id
     }

     # filesystem/terragrunt.hcl
     <empty>

     # filesystem/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['filesystem'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEfsFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
     ]
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/efs=efs-region-test-filesystem",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-region-test-filesystem",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/efs=efs-region-test-filesystem",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/efs=efs-region-test-filesystem",
     ]
    `);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateFilesystemName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEfsFilesystemModule>({
        inputs: {
          filesystemName: 'changed-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateFilesystemName)).toMatchSnapshot();
      const resultUpdateFilesystemName = await testModuleContainer.commit(appUpdateFilesystemName);
      expect(testModuleContainer.digestDiffs(resultUpdateFilesystemName.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/efs=efs-region-test-filesystem",
         "+ @octo/efs=efs-region-changed-filesystem",
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
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem-2',
      type: AwsEfsFilesystemModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
