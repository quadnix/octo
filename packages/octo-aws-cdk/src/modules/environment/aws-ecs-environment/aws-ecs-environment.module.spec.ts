import { CreateClusterCommand, DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
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
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

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

  const ECSClientMock = mockClient(ECSClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    ECSClientMock.on(CreateClusterCommand)
      .resolves({ cluster: { clusterArn: 'arn:aws:ecs:us-east-1:123:cluster/cluster-name' } })
      .on(DeleteClusterCommand)
      .resolves({});

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: ECSClient,
            value: ECSClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();
  });

  afterEach(async () => {
    ECSClientMock.restore();
    ResourceGroupsTaggingAPIClientMock.restore();

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
         "AddEcsClusterResourceAction",
       ],
     ]
    `);
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
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
         },
       ],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
         },
       ],
       [],
     ]
    `);
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
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
         },
       ],
       [],
     ]
    `);

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
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
     ]
    `);

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
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);
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
      expect(resultUpdateEnvironmentName.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "@octo/ecs-cluster=ecs-cluster-region-qa",
             "value": "@octo/ecs-cluster=ecs-cluster-region-qa",
           },
           {
             "action": "add",
             "field": "resourceId",
             "node": "@octo/ecs-cluster=ecs-cluster-region-changed-qa",
             "value": "@octo/ecs-cluster=ecs-cluster-region-changed-qa",
           },
         ],
         [],
       ]
      `);
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
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
