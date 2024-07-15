import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { AwsDeployment, AwsServer, OctoAwsCdkPackageMock } from '../../index.js';
import type { IIamRoleResponse } from '../../resources/iam/iam-role.interface.js';

describe('AwsDeployment UT', () => {
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
      await testModuleContainer.initialize();
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should test e2e', async () => {
      // Add a server.
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);
      await testModuleContainer.commit(app);

      // Add a deployment.
      const deployment = new AwsDeployment('v0.0.1');
      server.addDeployment(deployment);
      // Verify the anchor was added with default values.
      expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
     {
       "image": {
         "command": "",
         "ports": [],
         "uri": "",
       },
     }
    `);

      // Update deployment with a new image.
      deployment.updateDeploymentImage({
        command: 'command',
        ports: [{ containerPort: 80, protocol: 'tcp' }],
        uri: 'uri',
      });
      // Verify the anchor was updated with new values.
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

      // Verify resource transaction was as expected, and no resources were added.
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });
  });
});
