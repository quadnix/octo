import { type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
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

     resource "aws_ecr_repository" "ecr-us-east-1-family_image-b1f33b" {
       provider = aws._123-us-east-1
       force_delete = true
       image_scanning_configuration {
         scan_on_push = false
       }
       image_tag_mutability = "IMMUTABLE"
       name = "family/image"
     }

     # image/outputs.tf
     output "ecr-us-east-1-family_image-b1f33b-registryId" {
       value = aws_ecr_repository.ecr-us-east-1-family_image-b1f33b.registry_id
     }

     output "ecr-us-east-1-family_image-b1f33b-repositoryArn" {
       value = aws_ecr_repository.ecr-us-east-1-family_image-b1f33b.arn
     }

     output "ecr-us-east-1-family_image-b1f33b-repositoryName" {
       value = aws_ecr_repository.ecr-us-east-1-family_image-b1f33b.name
     }

     output "ecr-us-east-1-family_image-b1f33b-repositoryUri" {
       value = aws_ecr_repository.ecr-us-east-1-family_image-b1f33b.repository_url
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
         "AddAwsEcrImageRegionModelAction",
       ],
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
       "+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([
      '+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b',
    ]);
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
       "+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
       "- @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
       "+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
       "* @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
       "* @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
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
         "- @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
         "+ @octo/ecr-image=ecr-us-east-1-changed-family/image-b1f33b",
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
         "- @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
         "+ @octo/ecr-image=ecr-us-east-1-family/changed-image-b1f33b",
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

  it('should create a repository in each of two accounts sharing an AWS region', async () => {
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

    testModuleContainer.registerTerraformProvider('aws', '456', 'us-east-1');
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules(
          [
            {
              inputs: {
                imageFamily: 'family',
                imageName: 'image',
                regions: [stub<Region>('${{qaRegionModule.model.region}}')],
              },
              moduleId: 'qa-image',
              type: AwsEcrImageModule,
            },
            {
              inputs: {
                imageFamily: 'family',
                imageName: 'image',
                regions: [stub<Region>('${{productionRegionModule.model.region}}')],
              },
              moduleId: 'production-image',
              type: AwsEcrImageModule,
            },
          ],
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
       "+ @octo/ecr-image=ecr-us-east-1-family/image-85042e",
     ]
    `);
  });

  it('should keep every repository when a region is added', async () => {
    const createRegions = async (regions: { awsRegionId: string; regionId: string }[]): Promise<void> => {
      const {
        account: [account],
      } = await testModuleContainer.createTestModels('accountModule', { account: ['aws,123'], app: ['test-app'] });
      for (const { awsRegionId, regionId } of regions) {
        const {
          region: [region],
        } = await testModuleContainer.createTestModels(`${regionId}Module`, { account: [account], region: [regionId] });
        region.addAnchor(
          testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
            'AwsServerlessRegionAnchor',
            { awsRegionId, regionId, serverless: true },
            region,
          ),
        );
      }
    };
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-west-2');

    await createRegions([{ awsRegionId: 'us-east-1', regionId: 'east-a' }]);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub('${{east-aModule.model.region}}')],
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
       "+ @octo/ecr-image=ecr-us-east-1-family/image-b1f33b",
     ]
    `);

    // east-b shares east-a's AWS region, so it adds no repository; west adds one. Neither moves the
    // repository already there.
    await createRegions([
      { awsRegionId: 'us-east-1', regionId: 'east-a' },
      { awsRegionId: 'us-east-1', regionId: 'east-b' },
      { awsRegionId: 'us-west-2', regionId: 'west' },
    ]);
    const { resourceDiffs: resourceDiffsUpdate } = (
      await testModuleContainer
        .runModules<AwsEcrImageModule>(
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [
                stub('${{east-aModule.model.region}}'),
                stub('${{east-bModule.model.region}}'),
                stub('${{westModule.model.region}}'),
              ],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsUpdate)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecr-image=ecr-us-west-2-family/image-b1f33b",
     ]
    `);
  });

  describe('validation', () => {
    it('should validate every region is in one account', async () => {
      const {
        app: [app],
        region: [qaRegion],
      } = await testModuleContainer.createTestModels('qaRegionModule', {
        account: ['aws,123'],
        app: ['test-app'],
        region: ['qa-region'],
      });
      await testModuleContainer.createTestModels('productionRegionModule', {
        account: ['aws,456'],
        app: [app],
        region: ['production-region'],
      });
      qaRegion.addAnchor(
        testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
          'AwsServerlessRegionAnchor',
          { awsRegionId: 'us-east-1', regionId: qaRegion.regionId, serverless: true },
          qaRegion,
        ),
      );

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
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Region "production-region" is in account "456", but the image is in account "123"!"`,
      );
    });

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
