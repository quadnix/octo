import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcrImageModule } from './index.js';

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
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcrImageModule>(
      app,
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
     }

     data "aws_ecr_authorization_token" "ecr-us-east-1-family_image" {
       registry_id = aws_ecr_repository.ecr-us-east-1-family_image.registry_id
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
     output "ecr-us-east-1-family_image-authorizationToken" {
       value = data.aws_ecr_authorization_token.ecr-us-east-1-family_image.authorization_token
       sensitive = true
     }

     output "ecr-us-east-1-family_image-proxyEndpoint" {
       value = data.aws_ecr_authorization_token.ecr-us-east-1-family_image.proxy_endpoint
     }

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

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appCreate,
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

    const { app: appDelete } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appDelete,
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
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appCreate,
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
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appUpdateTags,
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

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appDeleteTags,
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
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appCreate,
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

      const { app: appUpdateImageFamily } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageModule>(
            appUpdateImageFamily,
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
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appCreate,
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

      const { app: appUpdateImageName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcrImageModule>(
            appUpdateImageName,
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcrImageModule>(
        appCreate,
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

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          appUpdateModuleId,
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
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            app,
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
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            app,
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

    it('should validate regions array is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcrImageModule>(
            app,
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
