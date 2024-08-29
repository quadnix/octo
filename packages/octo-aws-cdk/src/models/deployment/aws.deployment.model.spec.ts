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

    let app: App;
    let server: AwsServer;

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

      // Add a server.
      app = new App('test');
      server = new AwsServer('Backend');
      app.addServer(server);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should add deployment', async () => {
      // Commit state with app and server.
      await testModuleContainer.commit(app);

      const deployment = new AwsDeployment('v0.0.1');
      server.addDeployment(deployment);

      expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
       {
         "image": {
           "command": "",
           "ports": [],
           "uri": "",
         },
       }
      `);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });

    it('should update deployment with new image', async () => {
      // Commit state with app and server.
      await testModuleContainer.commit(app);

      const deployment = new AwsDeployment('v0.0.1');
      server.addDeployment(deployment);

      deployment.updateDeploymentImage({
        command: 'command',
        ports: [{ containerPort: 80, protocol: 'tcp' }],
        uri: 'uri',
      });

      expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
       {
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
       }
      `);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
