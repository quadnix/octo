import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import { type Account, type App, type Server, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsEcsServerAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-server.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import { AwsEcsDeploymentModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; server: Server }> {
  const {
    account: [account],
    app: [app],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    server: ['backend'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsServerAnchorSchema>(
      'AwsEcsServerAnchor',
      { deploymentType: 'ecs', serverKey: 'backend' },
      server,
    ),
  );
  server.addAnchor(
    testModuleContainer.createTestAnchor<AwsIamRoleAnchorSchema>(
      'AwsIamRoleAnchor',
      { iamRoleName: 'iamRoleName' },
      server,
    ),
  );

  return { account, app, server };
}

describe('AwsEcsDeploymentModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
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
    ResourceGroupsTaggingAPIClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['deployment'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsDeploymentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle deploymentContainerProperties change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsDeploymentModule>({
        inputs: {
          deploymentContainerProperties: {
            cpu: 256,
            image: {
              command: 'command',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: 'uri',
            },
            memory: 512,
          },
          deploymentTag: 'v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateDeploymentContainerProperties } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsDeploymentModule>({
        inputs: {
          deploymentContainerProperties: {
            cpu: 512,
            image: {
              command: 'change-command',
              ports: [{ containerPort: 8080, protocol: 'tcp' }],
              uri: 'change-uri',
            },
            memory: 1024,
          },
          deploymentTag: 'v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      const resultUpdateDeploymentContainerProperties = await testModuleContainer.commit(
        appUpdateDeploymentContainerProperties,
        {
          enableResourceCapture: true,
        },
      );
      expect(resultUpdateDeploymentContainerProperties.resourceDiffs).toMatchInlineSnapshot(`
       [
         [],
         [],
       ]
      `);
    });

    it('should handle deploymentTag change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsDeploymentModule>({
        inputs: {
          deploymentContainerProperties: {
            cpu: 256,
            image: {
              command: 'command',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: 'uri',
            },
            memory: 512,
          },
          deploymentTag: 'v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateDeploymentTag } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsDeploymentModule>({
        inputs: {
          deploymentContainerProperties: {
            cpu: 256,
            image: {
              command: 'command',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: 'uri',
            },
            memory: 512,
          },
          deploymentTag: 'change-v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      const resultUpdateDeploymentTag = await testModuleContainer.commit(appUpdateDeploymentTag, {
        enableResourceCapture: true,
      });
      expect(resultUpdateDeploymentTag.resourceDiffs).toMatchInlineSnapshot(`
       [
         [],
         [],
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment-1',
      type: AwsEcsDeploymentModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 256,
          image: {
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          },
          memory: 512,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment-2',
      type: AwsEcsDeploymentModule,
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
