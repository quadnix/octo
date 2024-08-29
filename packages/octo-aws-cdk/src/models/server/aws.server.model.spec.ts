import { App, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { AwsServer, OctoAwsCdkPackageMock } from '../../index.js';
import type { IIamRoleResponse } from '../../resources/iam/iam-role.interface.js';

describe('AwsServer UT', () => {
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

    it('should add server', async () => {
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "iam-role=iam-role-Backend-ServerRole",
             "value": "iam-role-Backend-ServerRole",
           },
         ],
       ]
      `);
    });

    it('should update server with security groups', async () => {
      const app = new App('test');
      const server = new AwsServer('Backend');
      app.addServer(server);

      const securityGroupRule: Parameters<AwsServer['addSecurityGroupRule']>[0] = {
        CidrBlock: '0.0.0.0/0',
        Egress: true,
        FromPort: 0,
        IpProtocol: 'tcp',
        ToPort: 65535,
      };
      server.addSecurityGroupRule(securityGroupRule);

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`[]`);
    });

    it('should remove server', async () => {
      const app = new App('test');

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "iam-role=iam-role-Backend-ServerRole",
             "value": "iam-role-Backend-ServerRole",
           },
         ],
       ]
      `);
    });
  });

  describe('security groups', () => {
    it('should CR security groups', () => {
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
    });
  });
});
