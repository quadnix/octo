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
import { HclAssert, type HclShape } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsEcsEnvironmentModule } from './index.js';

const BASE_HCL_SHAPE: HclShape = {
  'output.ecs-cluster-region-qa-clusterArn': { value: 'aws_ecs_cluster.ecs-cluster-region-qa.arn' },
  'resource.aws_ecs_cluster.ecs-cluster-region-qa': {
    name: 'region-qa',
    provider: 'aws.123-us-east-1',
    setting: {
      name: 'containerInsights',
      value: 'disabled',
    },
  },
};

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

    hcl = new HclAssert(octoTerraform, BASE_HCL_SHAPE);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        environmentVariables: { ENV_NAME: 'qa' },
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEcsEnvironmentModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['environment'],
    });

    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsEnvironmentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureEcsClusterResponseResourceAction",
       ],
     ]
    `);
    hcl.assert();
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEcsEnvironmentModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasAdded('@octo/ecs-cluster=ecs-cluster-region-qa');
    hcl.assert();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    new DiffAssert(resultDelete.resourceDiffs).hasDeleted('@octo/ecs-cluster=ecs-cluster-region-qa');
    hcl.assertShape({});

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        environmentVariables: { ENV_NAME: 'qa' },
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEcsEnvironmentModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    new DiffAssert(resultCreate.resourceDiffs).hasAdded('@octo/ecs-cluster=ecs-cluster-region-qa');
    hcl.assert();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        environmentVariables: { ENV_NAME: 'qa' },
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEcsEnvironmentModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    new DiffAssert(resultUpdateTags.resourceDiffs).hasTagUpdate('@octo/ecs-cluster=ecs-cluster-region-qa', {
      add: { tag2: 'value2' },
      delete: [],
      update: { tag1: 'value1_1' },
    });
    hcl.assert();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        environmentVariables: { ENV_NAME: 'qa' },
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment',
      type: AwsEcsEnvironmentModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    new DiffAssert(resultDeleteTags.resourceDiffs).hasTagUpdate('@octo/ecs-cluster=ecs-cluster-region-qa', {
      add: {},
      delete: ['tag1', 'tag2'],
      update: {},
    });
    hcl.assert();
  });

  describe('input changes', () => {
    it('should handle environmentName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
        inputs: {
          environmentName: 'qa',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdateEnvironmentName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
        inputs: {
          environmentName: 'changed-qa',
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      });
      const resultUpdateEnvironmentName = await testModuleContainer.commit(appUpdateEnvironmentName, {
        enableResourceCapture: true,
      });
      new DiffAssert(resultUpdateEnvironmentName.resourceDiffs)
        .hasDeleted('@octo/ecs-cluster=ecs-cluster-region-qa')
        .hasAdded('@octo/ecs-cluster=ecs-cluster-region-changed-qa');
      hcl.assertShape({
        'output.ecs-cluster-region-changed-qa-clusterArn': {
          value: 'aws_ecs_cluster.ecs-cluster-region-changed-qa.arn',
        },
        'resource.aws_ecs_cluster.ecs-cluster-region-changed-qa': {
          name: 'region-changed-qa',
          provider: 'aws.123-us-east-1',
          setting: {
            name: 'containerInsights',
            value: 'disabled',
          },
        },
      });
    });

    it('should handle environmentVariables change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
        inputs: {
          environmentName: 'qa',
          environmentVariables: { ENV_NAME: 'qa' },
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.assert();

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
        inputs: {
          environmentName: 'qa',
          environmentVariables: { ENV_NAME: 'qa2' },
          region: stub('${{testModule.model.region}}'),
        },
        moduleId: 'environment',
        type: AwsEcsEnvironmentModule,
      });
      const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
      new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
      hcl.assert();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment-1',
      type: AwsEcsEnvironmentModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.assert();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
      inputs: {
        environmentName: 'qa',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'environment-2',
      type: AwsEcsEnvironmentModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    new DiffAssert(resultUpdateModuleId.resourceDiffs).hasNoChanges();
    hcl.assert();
  });

  describe('validation', () => {
    it('should validate environmentName is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
          inputs: {
            environmentName: '',
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "environmentName" in schema could not be validated!"`);
    });

    it('should validate environmentVariables keys', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
          inputs: {
            environmentName: 'qa',
            environmentVariables: { X: 'value' },
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "environmentVariables" in schema could not be validated!"`,
      );
    });

    it('should validate environmentVariables values are not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsEcsEnvironmentModule>({
          inputs: {
            environmentName: 'qa',
            environmentVariables: { ENV_NAME: '' },
            region: stub('${{testModule.model.region}}'),
          },
          moduleId: 'environment',
          type: AwsEcsEnvironmentModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Property "environmentVariables" in schema could not be validated!"`,
      );
    });
  });
});
