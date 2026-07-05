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
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsDeploymentModule>(
      app,
      {
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
      },
      { filterByModuleIds: ['deployment'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    // The deployment module contributes no terraform of its own; the task definition only
    // materializes once composed with an execution. The generated tree is therefore empty here.
    expect(hclRender).toMatchInlineSnapshot(`""`);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsDeploymentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appCreate,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    const { app: appUpdate } = await setup(testModuleContainer);
    const update = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appUpdate,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(update.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(update.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appDelete,
          {
            hidden: true,
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appCreate,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appUpdateTags,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appDeleteTags,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle deploymentContainerProperties change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appCreate,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateDeploymentContainerProperties } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsDeploymentModule>(
            appUpdateDeploymentContainerProperties,
            {
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
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should handle deploymentTag change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appCreate,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateDeploymentTag } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsDeploymentModule>(
            appUpdateDeploymentTag,
            {
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
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsDeploymentModule>(
        appCreate,
        {
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
        },
        { terraformTarget: 'skip' },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsDeploymentModule>(
          appUpdateModuleId,
          {
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
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate deploymentTag length', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsEcsDeploymentModule>(
            app,
            {
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
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "deploymentTag" in schema could not be validated!"`);
    });
  });
});
