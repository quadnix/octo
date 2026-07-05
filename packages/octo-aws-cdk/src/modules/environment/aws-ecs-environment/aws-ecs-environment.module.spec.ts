import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcsEnvironmentModule } from './index.js';

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

describe('AwsEcsEnvironmentModule UT', () => {
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
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
      app,
      {
        inputs: {
          environmentName: 'qa',
          environmentVariables: { ENV_NAME: 'qa' },
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      },
      { filterByModuleIds: ['environment'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# environment/main.tf
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

     resource "aws_ecs_cluster" "ecs-cluster-region-qa" {
       provider = aws._123-us-east-1
       name = "region-qa"
       setting {
         name = "containerInsights"
         value = "disabled"
       }
     }

     # environment/outputs.tf
     output "ecs-cluster-region-qa-clusterArn" {
       value = aws_ecs_cluster.ecs-cluster-region-qa.arn
     }

     # environment/terragrunt.hcl
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

     # environment/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsEnvironmentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/ecs-cluster=ecs-cluster-region-qa",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsEnvironmentModule>(
        appCreate,
        {
          inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDelete } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
      appDelete,
      {
        hidden: true,
        inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      },
      { terraformTarget: 'skip' },
    );
    const { hclDiff, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/ecs-cluster=ecs-cluster-region-qa",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsEnvironmentModule>(
        appCreate,
        {
          inputs: {
            environmentName: 'qa',
            environmentVariables: { ENV_NAME: 'qa' },
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTagsGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
      appUpdateTags,
      {
        inputs: {
          environmentName: 'qa',
          environmentVariables: { ENV_NAME: 'qa' },
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      },
      { terraformTarget: 'skip' },
    );
    const update = (await updateTagsGenerator.next()).value!;
    expect(update.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(update.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-cluster=ecs-cluster-region-qa",
     ]
    `);
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTagsGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
      appDeleteTags,
      {
        inputs: {
          environmentName: 'qa',
          environmentVariables: { ENV_NAME: 'qa' },
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      },
      { terraformTarget: 'skip' },
    );
    const deleteTags = (await deleteTagsGenerator.next()).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/ecs-cluster=ecs-cluster-region-qa",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle environmentName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsEnvironmentModule>(
          appCreate,
          {
            inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
            moduleId: 'environment',
            type: AwsEcsEnvironmentModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdate } = await setup(testModuleContainer);
      const runModulesGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
        appUpdate,
        {
          inputs: { environmentName: 'changed-qa', region: stub('${{testModule.model.region}}') },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        },
        { terraformTarget: 'skip' },
      );
      const { hclDiff, resourceDiffs } = (await runModulesGenerator.next()).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/ecs-cluster=ecs-cluster-region-qa",
         "+ @octo/ecs-cluster=ecs-cluster-region-changed-qa",
       ]
      `);
    });

    it('should handle environmentVariables change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsEnvironmentModule>(
          appCreate,
          {
            inputs: {
              environmentName: 'qa',
              environmentVariables: { ENV_NAME: 'qa' },
              region: stub('${{testModule.model.region}}'),
            },
            moduleId: 'environment',
            type: AwsEcsEnvironmentModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();
      expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

      const { app: appUpdate } = await setup(testModuleContainer);
      const runModulesGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
        appUpdate,
        {
          inputs: {
            environmentName: 'qa',
            environmentVariables: { ENV_NAME: 'qa2' },
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        },
        { terraformTarget: 'skip' },
      );
      const { hclDiff, resourceDiffs } = (await runModulesGenerator.next()).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsEnvironmentModule>(
        appCreate,
        {
          inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
          moduleId: 'environment-1',
          type: AwsEcsEnvironmentModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();
    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

    const { app: appUpdate } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsEnvironmentModule>(
      appUpdate,
      {
        inputs: { environmentName: 'qa', region: stub('${{testModule.model.region}}') },
        moduleId: 'environment-2',
        type: AwsEcsEnvironmentModule,
      },
      { terraformTarget: 'skip' },
    );
    const { hclDiff, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate environmentName is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcsEnvironmentModule>(
            app,
            {
              inputs: { environmentName: '', region: stub('${{testModule.model.region}}') },
              moduleId: 'environment',
              type: AwsEcsEnvironmentModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "environmentName" in schema could not be validated!"`);
    });

    it('should validate environmentVariables keys', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcsEnvironmentModule>(
            app,
            {
              inputs: {
                environmentName: 'qa',
                environmentVariables: { X: 'value' },
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'environment',
              type: AwsEcsEnvironmentModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "environmentVariables" in schema could not be validated!"`,
      );
    });

    it('should validate environmentVariables values are not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcsEnvironmentModule>(
            app,
            {
              inputs: {
                environmentName: 'qa',
                environmentVariables: { ENV_NAME: '' },
                region: stub('${{testModule.model.region}}'),
              },
              moduleId: 'environment',
              type: AwsEcsEnvironmentModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "environmentVariables" in schema could not be validated!"`,
      );
    });
  });
});
