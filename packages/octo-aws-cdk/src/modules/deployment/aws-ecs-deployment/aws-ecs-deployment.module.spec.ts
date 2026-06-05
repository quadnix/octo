import { type App, DiffAssert, type Server, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsEcsServerAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-server.anchor.schema.js';
import type { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert, type HclShape } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsEcsDeploymentModule } from './index.js';

const BASE_HCL_SHAPE: HclShape = {};

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

    hcl = new HclAssert(octoTerraform, BASE_HCL_SHAPE);
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
    hcl.assert();
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
    new DiffAssert(resultCreate.resourceDiffs).hasNoChanges();
    hcl.assert();

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
    const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
    new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
    hcl.assert();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    new DiffAssert(resultDelete.resourceDiffs).hasNoChanges();
    hcl.assertShape({});

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
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
    new DiffAssert(resultCreate.resourceDiffs).hasNoChanges();
    hcl.assert();

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
    new DiffAssert(resultUpdateTags.resourceDiffs).hasNoChanges();
    hcl.assert();

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
    new DiffAssert(resultDeleteTags.resourceDiffs).hasNoChanges();
    hcl.assert();
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
      hcl.assert();

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
      const resultUpdateDeploymentContainerProperties = await testModuleContainer.commit(
        appUpdateDeploymentContainerProperties,
        {
          enableResourceCapture: true,
        },
      );
      new DiffAssert(resultUpdateDeploymentContainerProperties.resourceDiffs).hasNoChanges();
      hcl.assertShape({});
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
      hcl.assert();

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
      const resultUpdateDeploymentTag = await testModuleContainer.commit(appUpdateDeploymentTag, {
        enableResourceCapture: true,
      });
      new DiffAssert(resultUpdateDeploymentTag.resourceDiffs).hasNoChanges();
      hcl.assertShape({});
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
    hcl.assert();

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
    new DiffAssert(resultUpdateModuleId.resourceDiffs).hasNoChanges();
    hcl.assert();
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
