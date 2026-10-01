import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsEcrImageModule } from './index.js';

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

describe('AwsEcrImageModule UT', () => {
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
    const runModulesGenerator = testModuleContainer.runModules<AwsEcrImageModule>(
      {
        inputs: {
          imageFamily: 'family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      },
      { filterByModuleIds: ['image'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs, resourceTransaction } = (await runModulesGenerator.next())
      .value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# image/main.tf
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

     resource "aws_ecr_repository" "ecr-us-east-1-family_image" {
       provider = aws._123-us-east-1
       force_delete = true
       image_scanning_configuration {
         scan_on_push = false
       }
       image_tag_mutability = "IMMUTABLE"
       name = "family/image"
     }

     # image/outputs.tf
     output "ecr-us-east-1-family_image-registryId" {
       value = aws_ecr_repository.ecr-us-east-1-family_image.registry_id
     }

     output "ecr-us-east-1-family_image-repositoryArn" {
       value = aws_ecr_repository.ecr-us-east-1-family_image.arn
     }

     output "ecr-us-east-1-family_image-repositoryName" {
       value = aws_ecr_repository.ecr-us-east-1-family_image.name
     }

     output "ecr-us-east-1-family_image-repositoryUri" {
       value = aws_ecr_repository.ecr-us-east-1-family_image.repository_url
     }

     # image/terragrunt.hcl
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

     # image/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcrImageModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "TerraformNoopResourceAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
  });

  it('should create the repository in a serverless region', async () => {
    const {
      region: [region],
    } = await testModuleContainer.createTestModels('testModule', {
      account: ['aws,123'],
      app: ['test-app'],
      region: ['serverless-region'],
    });
    region.addAnchor(
      testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
        'AwsServerlessRegionAnchor',
        { awsRegionId: 'us-east-1', regionId: 'serverless-region', serverless: true },
        region,
      ),
    );

    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: { imageFamily: 'family', imageName: 'image', regions: [stub('${{testModule.model.region}}')] },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { filterByModuleIds: ['image'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual(['+ @octo/ecr-image=ecr-us-east-1-family/image']);
  });

  it('should CUD', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            hidden: true,
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDelete)).toMatchInlineSnapshot(`
     [
       "- @octo/ecr-image=ecr-us-east-1-family/image",
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
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle imageFamily change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: 'changed-family',
                imageName: 'image',
                regions: [stub('${{testModule.model.region}}')],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image=ecr-us-east-1-family/image",
         "+ @octo/ecr-image=ecr-us-east-1-changed-family/image",
       ]
      `);
    });

    it('should handle imageName change', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: 'family',
                imageName: 'changed-image',
                regions: [stub('${{testModule.model.region}}')],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image=ecr-us-east-1-family/image",
         "+ @octo/ecr-image=ecr-us-east-1-family/changed-image",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcrImageModule>(
        {
          inputs: {
            imageFamily: 'family',
            imageName: 'image',
            regions: [stub('${{testModule.model.region}}')],
          },
          moduleId: 'image-1',
          type: AwsEcrImageModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{testModule.model.region}}')],
            },
            moduleId: 'image-2',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate imageFamily is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: '',
                imageName: 'image',
                regions: [stub('${{testModule.model.region}}')],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "imageFamily" in schema could not be validated!"`);
    });

    it('should validate imageName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: 'family',
                imageName: '',
                regions: [stub('${{testModule.model.region}}')],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "imageName" in schema could not be validated!"`);
    });

    it('should validate regions of different accounts do not share an AWS region', async () => {
      const {
        app: [app],
        region: [qaRegion],
      } = await testModuleContainer.createTestModels('qaRegionModule', {
        account: ['aws,123'],
        app: ['test-app'],
        region: ['qa-region'],
      });
      const {
        region: [productionRegion],
      } = await testModuleContainer.createTestModels('productionRegionModule', {
        account: ['aws,456'],
        app: [app],
        region: ['production-region'],
      });
      for (const region of [qaRegion, productionRegion]) {
        region.addAnchor(
          testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
            'AwsServerlessRegionAnchor',
            { awsRegionId: 'us-east-1', regionId: region.regionId, serverless: true },
            region,
          ),
        );
      }

      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: 'family',
                imageName: 'image',
                regions: [stub('${{qaRegionModule.model.region}}'), stub('${{productionRegionModule.model.region}}')],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Image cannot be held in "us-east-1" by more than one account!"`);
    });

    it('should validate regions array is not empty', async () => {
      await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            {
              inputs: {
                imageFamily: 'family',
                imageName: 'image',
                regions: [],
              },
              moduleId: 'image',
              type: AwsEcrImageModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "regions" in schema could not be validated!"`);
    });
  });
});
