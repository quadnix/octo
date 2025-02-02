import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Server,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { EcsServerAnchor } from '../../../anchors/ecs-server/ecs-server.anchor.js';
import { IamRoleAnchor } from '../../../anchors/iam-role/iam-role.anchor.js';
import { AwsDeploymentModule } from './aws-deployment.module.js';

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

  server.addAnchor(new EcsServerAnchor('EcsServerAnchor', { deploymentType: 'ecs', serverKey: 'backend' }, server));
  server.addAnchor(new IamRoleAnchor('IamRoleAnchor', { iamRoleName: 'iamRoleName' }, server));

  return { account, app, server };
}

describe('AwsDeploymentModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDeploymentModule>({
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
        deploymentTag: 'v0.0.1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsDeploymentModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['deployment'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddDeploymentModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDeploymentModule>({
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
        deploymentTag: 'v0.0.1',
        server: stub('${{testModule.model.server}}'),
      },
      moduleId: 'deployment',
      type: AwsDeploymentModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
