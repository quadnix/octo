import { type App, type Server, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsEcsServerAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-server.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import { AwsEcsDeploymentModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App; server: Server }> {
  const {
    app: [app],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    app: ['test-app'],
    server: ['backend'],
  });

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

  return { app, server };
}

describe('AwsEcsDeploymentModule UT', () => {
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
    // The deployment module contributes no terraform of its own; the task definition only
    // materializes once composed with an execution. The generated tree is therefore empty here.
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`""`);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['deployment'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsDeploymentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appUpdate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsDeploymentModule>({
      inputs: {
        deploymentContainerProperties: {
          cpu: 512,
          image: {
            command: 'changed-command',
            ports: [{ containerPort: 8080, protocol: 'tcp' }],
            uri: 'changed-uri',
          },
          memory: 1024,
        },
        deploymentTag: 'v1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsEcsDeploymentModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdate)).toMatchSnapshot();
    const resultUpdate = await testModuleContainer.commit(appUpdate);
    expect(testModuleContainer.digestDiffs(resultUpdate.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
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
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);

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
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateDeploymentContainerProperties } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsDeploymentModule>({
        inputs: {
          deploymentContainerProperties: {
            cpu: 512,
            image: {
              command: 'changed-command',
              ports: [{ containerPort: 8080, protocol: 'tcp' }],
              uri: 'changed-uri',
            },
            memory: 1024,
          },
          deploymentTag: 'v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateDeploymentContainerProperties)).toMatchSnapshot();
      const resultUpdateDeploymentContainerProperties = await testModuleContainer.commit(
        appUpdateDeploymentContainerProperties,
      );
      expect(
        testModuleContainer.digestDiffs(resultUpdateDeploymentContainerProperties.resourceDiffs),
      ).toMatchInlineSnapshot(`[]`);
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
      await testModuleContainer.commit(appCreate);

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
          deploymentTag: 'changed-v1',
          server: stub('${{testModule.model.server}}'),
        },
        moduleId: 'deployment',
        type: AwsEcsDeploymentModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateDeploymentTag)).toMatchSnapshot();
      const resultUpdateDeploymentTag = await testModuleContainer.commit(appUpdateDeploymentTag);
      expect(testModuleContainer.digestDiffs(resultUpdateDeploymentTag.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
    await testModuleContainer.commit(appCreate);

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
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate deploymentTag length', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
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
            deploymentTag: '',
            server: stub('${{testModule.model.server}}'),
          },
          moduleId: 'deployment',
          type: AwsEcsDeploymentModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "deploymentTag" in schema could not be validated!"`);
    });
  });
});
