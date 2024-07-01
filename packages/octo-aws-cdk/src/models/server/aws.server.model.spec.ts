import { CreateRoleCommand, DeleteRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { jest } from '@jest/globals';
import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
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

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult1 = await generator1.next();
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult1.value);

      // Verify resource transaction was as expected.
      expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`
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

      const diffs4 = await octoAws.diff(app);
      const generator4 = await octoAws.beginTransaction(diffs4, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult4 = await generator4.next();
      const modelTransactionResult4 = (await generator4.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult4.value);

      // Verify resource transaction was as expected.
      expect(resourceTransactionResult4.value).toMatchInlineSnapshot(`
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
