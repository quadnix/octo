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
    await testModuleContainer.runModule<AwsEcrImageModule>({
      inputs: {
        imageFamily: 'family',
        imageName: 'image',
        regions: [stub('${{testModule.model.region}}')],
      },
      moduleId: 'image',
      type: AwsEcrImageModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['image'],
    });

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
         "CaptureEcrImageResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
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

     data "aws_ecr_authorization_token" "ecr-us-east-1-family/image" {
       registry_id = aws_ecr_repository.ecr-us-east-1-family/image.registry_id
     }

     resource "aws_ecr_repository" "ecr-us-east-1-family/image" {
       provider = aws.123-us-east-1
       force_delete = true
       image_scanning_configuration {
         scan_on_push = false
       }
       image_tag_mutability = "IMMUTABLE"
       name = "family/image"
     }

     output "ecr-us-east-1-family/image-authorizationToken" {
       value = data.aws_ecr_authorization_token.ecr-us-east-1-family/image.authorization_token
     }

     output "ecr-us-east-1-family/image-proxyEndpoint" {
       value = data.aws_ecr_authorization_token.ecr-us-east-1-family/image.proxy_endpoint
     }

     output "ecr-us-east-1-family/image-registryId" {
       value = aws_ecr_repository.ecr-us-east-1-family/image.registry_id
     }

     output "ecr-us-east-1-family/image-repositoryArn" {
       value = aws_ecr_repository.ecr-us-east-1-family/image.arn
     }

     output "ecr-us-east-1-family/image-repositoryName" {
       value = aws_ecr_repository.ecr-us-east-1-family/image.name
     }

     output "ecr-us-east-1-family/image-repositoryUri" {
       value = aws_ecr_repository.ecr-us-east-1-family/image.repository_url
     }"
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ data.aws_ecr_authorization_token.ecr-us-east-1-family/image | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-authorizationToken | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-proxyEndpoint | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-registryId | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryArn | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryName | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryUri | blocks: 0 | properties: 1",
       "+ resource.aws_ecr_repository.ecr-us-east-1-family/image | blocks: 1 | properties: 4",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- data.aws_ecr_authorization_token.ecr-us-east-1-family/image | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-authorizationToken | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-proxyEndpoint | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-registryId | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-repositoryArn | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-repositoryName | blocks: 0 | properties: 1",
       "- output.ecr-us-east-1-family/image-repositoryUri | blocks: 0 | properties: 1",
       "- resource.aws_ecr_repository.ecr-us-east-1-family/image | blocks: 1 | properties: 4",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
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
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ data.aws_ecr_authorization_token.ecr-us-east-1-family/image | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-authorizationToken | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-proxyEndpoint | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-registryId | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryArn | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryName | blocks: 0 | properties: 1",
       "+ output.ecr-us-east-1-family/image-repositoryUri | blocks: 0 | properties: 1",
       "+ resource.aws_ecr_repository.ecr-us-east-1-family/image | blocks: 1 | properties: 4",
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
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
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

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
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/ecr-image=ecr-us-east-1-family/image",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

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
      const resultUpdateImageFamily = await testModuleContainer.commit(appUpdateImageFamily, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateImageFamily.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "+ @octo/ecr-image=ecr-us-east-1-changed-family/image",
         "- @octo/ecr-image=ecr-us-east-1-family/image",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ data.aws_ecr_authorization_token.ecr-us-east-1-changed-family/image | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-authorizationToken | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-proxyEndpoint | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-registryId | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-repositoryArn | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-repositoryName | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-changed-family/image-repositoryUri | blocks: 0 | properties: 1",
         "+ resource.aws_ecr_repository.ecr-us-east-1-changed-family/image | blocks: 1 | properties: 4",
         "- data.aws_ecr_authorization_token.ecr-us-east-1-family/image | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-authorizationToken | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-proxyEndpoint | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-registryId | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryArn | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryName | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryUri | blocks: 0 | properties: 1",
         "- resource.aws_ecr_repository.ecr-us-east-1-family/image | blocks: 1 | properties: 4",
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
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

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
      const resultUpdateImageName = await testModuleContainer.commit(appUpdateImageName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateImageName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "+ @octo/ecr-image=ecr-us-east-1-family/changed-image",
         "- @octo/ecr-image=ecr-us-east-1-family/image",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ data.aws_ecr_authorization_token.ecr-us-east-1-family/changed-image | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-authorizationToken | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-proxyEndpoint | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-registryId | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-repositoryArn | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-repositoryName | blocks: 0 | properties: 1",
         "+ output.ecr-us-east-1-family/changed-image-repositoryUri | blocks: 0 | properties: 1",
         "+ resource.aws_ecr_repository.ecr-us-east-1-family/changed-image | blocks: 1 | properties: 4",
         "- data.aws_ecr_authorization_token.ecr-us-east-1-family/image | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-authorizationToken | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-proxyEndpoint | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-registryId | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryArn | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryName | blocks: 0 | properties: 1",
         "- output.ecr-us-east-1-family/image-repositoryUri | blocks: 0 | properties: 1",
         "- resource.aws_ecr_repository.ecr-us-east-1-family/image | blocks: 1 | properties: 4",
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
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

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
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
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
