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
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
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
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     data "aws_ecr_authorization_token" "ecr-us-east-1-family_image" {
       registry_id = aws_ecr_repository.ecr-us-east-1-family_image.registry_id
     }

     resource "aws_ecr_repository" "ecr-us-east-1-family_image" {
       provider = aws.123-us-east-1
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
     <empty>

     # image/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['image'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcrImageModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "TerraformNoopResourceAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.renderHcl(appCreate)).toMatchSnapshot();
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
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
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.renderHcl(appCreate)).toMatchSnapshot();
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle imageFamily change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcrImageModule>({
        inputs: {
          imageFamily: 'family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateImageFamily } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcrImageModule>({
        inputs: {
          imageFamily: 'changed-family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateImageFamily)).toMatchSnapshot();
      const resultUpdateImageFamily = await testModuleContainer.commit(appUpdateImageFamily);
      expect(testModuleContainer.digestDiffs(resultUpdateImageFamily.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image=ecr-us-east-1-family/image",
         "+ @octo/ecr-image=ecr-us-east-1-changed-family/image",
       ]
      `);
    });

    it('should handle imageName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcrImageModule>({
        inputs: {
          imageFamily: 'family',
          imageName: 'image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateImageName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcrImageModule>({
        inputs: {
          imageFamily: 'family',
          imageName: 'changed-image',
          regions: [stub('${{testModule.model.region}}')],
        },
        moduleId: 'image',
        type: AwsEcrImageModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateImageName)).toMatchSnapshot();
      const resultUpdateImageName = await testModuleContainer.commit(appUpdateImageName);
      expect(testModuleContainer.digestDiffs(resultUpdateImageName.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecr-image=ecr-us-east-1-family/image",
         "+ @octo/ecr-image=ecr-us-east-1-family/changed-image",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image-1',
      type: AwsEcrImageModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image-2',
      type: AwsEcrImageModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate imageFamily is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcrImageModule>({
          inputs: {
            imageFamily: '',
            imageName: 'image',
            regions: [stub('${{testModule.model.region}}')],
          },
          moduleId: 'image',
          type: AwsEcrImageModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "imageFamily" in schema could not be validated!"`);
    });

    it('should validate imageName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcrImageModule>({
          inputs: {
            imageFamily: 'family',
            imageName: '',
            regions: [stub('${{testModule.model.region}}')],
          },
          moduleId: 'image',
          type: AwsEcrImageModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "imageName" in schema could not be validated!"`);
    });

    it('should validate regions array is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcrImageModule>({
          inputs: {
            imageFamily: 'family',
            imageName: 'image',
            regions: [],
          },
          moduleId: 'image',
          type: AwsEcrImageModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "regions" in schema could not be validated!"`);
    });
  });
});
