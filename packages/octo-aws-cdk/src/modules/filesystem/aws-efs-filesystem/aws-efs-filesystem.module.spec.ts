import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEfsFilesystemModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
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
    await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEfsFilesystemModule>(
      {
        inputs: {
          filesystemName: 'test-filesystem',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'filesystem',
        type: AwsEfsFilesystemModule,
      },
      { filterByModuleIds: ['filesystem'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
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
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     resource "aws_efs_file_system" "efs-test-filesystem-51fb32" {
       provider = aws._123-us-east-1
       encrypted = false
       performance_mode = "generalPurpose"
       throughput_mode = "bursting"
       tags = {
         Name = "test-filesystem"
       }
     }

     resource "aws_efs_backup_policy" "efs-test-filesystem-51fb32_backup_policy" {
       provider = aws._123-us-east-1
       backup_policy {
         status = "DISABLED"
       }
       file_system_id = aws_efs_file_system.efs-test-filesystem-51fb32.id

       depends_on = [aws_efs_file_system.efs-test-filesystem-51fb32]
     }

     # filesystem/outputs.tf
     output "efs-test-filesystem-51fb32-FileSystemArn" {
       value = aws_efs_file_system.efs-test-filesystem-51fb32.arn
     }

     output "efs-test-filesystem-51fb32-FileSystemId" {
       value = aws_efs_file_system.efs-test-filesystem-51fb32.id
     }

     # filesystem/terragrunt.hcl
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

     # filesystem/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEfsFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-test-filesystem-51fb32",
     ]
    `);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-test-filesystem-51fb32",
     ]
    `);

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            hidden: true,
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDelete)).toMatchInlineSnapshot(`
     [
       "- @octo/efs=efs-test-filesystem-51fb32",
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
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/efs=efs-test-filesystem-51fb32",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/efs=efs-test-filesystem-51fb32",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/efs=efs-test-filesystem-51fb32",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle filesystemName change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEfsFilesystemModule>(
            {
              inputs: {
                filesystemName: 'changed-filesystem',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'filesystem',
              type: AwsEfsFilesystemModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/efs=efs-test-filesystem-51fb32",
         "+ @octo/efs=efs-changed-filesystem-51fb32",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEfsFilesystemModule>(
        {
          inputs: {
            filesystemName: 'test-filesystem',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'filesystem-1',
          type: AwsEfsFilesystemModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEfsFilesystemModule>(
          {
            inputs: {
              filesystemName: 'test-filesystem',
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'filesystem-2',
            type: AwsEfsFilesystemModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate filesystemName length', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEfsFilesystemModule>(
            {
              inputs: {
                filesystemName: '',
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'filesystem',
              type: AwsEfsFilesystemModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "filesystemName" in schema could not be validated!"`);
    });
  });
});
