import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsDeployment, AwsServer, OctoAwsCdkPackageMock } from '../../index.js';
import type { IIamRoleResponse } from '../../resources/iam/iam-role.interface.js';

describe('AwsDeployment UT', () => {
  const stateProvider = new TestStateProvider();

  beforeAll(async () => {
    await TestContainer.create(
      {
        importFrom: [OctoAwsCdkPackageMock],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  describe('diff()', () => {
    let testModuleContainer: TestModuleContainer;

    const TestModule = async ({
      commit = false,
      includeDeployment = false,
      includeDeploymentImage = false,
    }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);

      if (includeDeployment) {
        const deployment = new AwsDeployment('v0.0.1');
        server.addDeployment(deployment);

        if (includeDeploymentImage) {
          deployment.updateDeploymentImage({
            command: 'command',
            ports: [{ containerPort: 80, protocol: 'tcp' }],
            uri: 'uri',
          });
        }
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {
          'iam-role-Backend-ServerRole': {
            response: <Partial<IIamRoleResponse>>{
              Arn: 'Arn',
              RoleId: 'RoleId',
              RoleName: 'RoleName',
            },
          },
        },
      });
      await testModuleContainer.initialize(stateProvider);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add deployment', async () => {
      const app = await TestModule({
        commit: false,
        includeDeployment: true,
      });

      const server = app.getChild('server', [{ key: 'serverKey', value: 'Backend' }]) as AwsServer;
      const deployment = server.getChild('deployment', [{ key: 'deploymentTag', value: 'v0.0.1' }]) as AwsDeployment;

      expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
       {
         "cpu": 256,
         "image": {
           "command": "",
           "ports": [],
           "uri": "",
         },
         "memory": 512,
       }
      `);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });

    it('should update deployment with new image', async () => {
      const app = await TestModule({
        commit: false,
        includeDeployment: true,
        includeDeploymentImage: true,
      });

      const server = app.getChild('server', [{ key: 'serverKey', value: 'Backend' }]) as AwsServer;
      const deployment = server.getChild('deployment', [{ key: 'deploymentTag', value: 'v0.0.1' }]) as AwsDeployment;

      expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
       {
         "cpu": 256,
         "image": {
           "command": "command",
           "ports": [
             {
               "containerPort": 80,
               "protocol": "tcp",
             },
           ],
           "uri": "uri",
         },
         "memory": 512,
       }
      `);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
