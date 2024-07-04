import { CreateRoleCommand, DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { jest } from '@jest/globals';
import { App, Container, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import { OctoAws } from '../../main.js';
import { AwsServer } from '../../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsServer UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: IAMClient,
            value: { send: jest.fn() },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  describe('diff()', () => {
    it('should create new server and delete it', async () => {
      const iamClient = await Container.get(IAMClient);
      (iamClient.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateRoleCommand) {
          return {
            Role: {
              Arn: 'roleArn',
              RoleId: 'roleId',
              RoleName: 'roleName',
            },
          };
        } else if (instance instanceof DeleteRoleCommand) {
          return undefined;
        }
      });

      const octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));

      // Add server.
      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "iam-role=iam-role-backend-ServerRole",
             "value": "iam-role-backend-ServerRole",
           },
         ],
       ]
      `);

      // Remove server.
      server.remove();

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "iam-role=iam-role-backend-ServerRole",
             "value": "iam-role-backend-ServerRole",
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
