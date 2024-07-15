import { App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { AwsServer, OctoAwsCdkPackageMock } from '../../index.js';
import type { IIamRoleResponse } from '../../resources/iam/iam-role.interface.js';

describe('AwsServer UT', () => {
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

    it('should create new server and delete it', async () => {
      // Add server.
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "iam-role=iam-role-Backend-ServerRole",
             "value": "iam-role-Backend-ServerRole",
           },
         ],
       ]
      `);

      // Remove server.
      server.remove();
      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "iam-role=iam-role-Backend-ServerRole",
             "value": "iam-role-Backend-ServerRole",
           },
         ],
       ]
      `);
    });
  });

  describe('security groups', () => {
    it('should CRD security groups', () => {
      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const securityGroupRule: Parameters<AwsServer['addSecurityGroupRule']>[0] = {
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 0,
        IpProtocol: 'tcp',
        ToPort: 65535,
      };
      server.addSecurityGroupRule(securityGroupRule);

      expect(server.getSecurityGroupRules()).toEqual([securityGroupRule]);

      server.removeSecurityGroupRule(securityGroupRule);

      expect(server.getSecurityGroupRules()).toEqual([]);
    });
  });
});
