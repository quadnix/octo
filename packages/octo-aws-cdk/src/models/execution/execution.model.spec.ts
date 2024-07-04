import { AuthorizeSecurityGroupEgressCommand, CreateSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  CreateServiceCommand,
  DeleteTaskDefinitionsCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
} from '@aws-sdk/client-ecs';
import { CreateFileSystemCommand, CreateMountTargetCommand, EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import { App, Container, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import {
  AwsDeployment,
  AwsEnvironment,
  AwsExecution,
  AwsRegion,
  AwsServer,
  AwsSubnet,
  OctoAws,
  RegionId,
} from '../../index.js';
import { ProcessUtility } from '../../utilities/process/process.utility.js';
import { RetryUtility } from '../../utilities/retry/retry.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Execution UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  let retryPromiseMock: jest.MockedFunction<any>;
  let runDetachedProcessMock: jest.MockedFunction<any>;

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: EC2Client,
            value: { send: jest.fn() },
          },
          {
            type: ECSClient,
            value: { send: jest.fn() },
          },
          {
            type: EFSClient,
            value: { send: jest.fn() },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    retryPromiseMock = jest.spyOn(RetryUtility, 'retryPromise');
    runDetachedProcessMock = jest.spyOn(ProcessUtility, 'runDetachedProcess');
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  it('should test e2e', async () => {
    (retryPromiseMock as jest.Mock).mockResolvedValue(undefined as never);
    runDetachedProcessMock.mockReturnValue({
      on: jest.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'exit') {
          cb(0);
        }
      }),
      removeAllListeners: jest.fn(),
    });

    const ec2Client = await Container.get(EC2Client);
    (ec2Client.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof CreateSecurityGroupCommand) {
        return { GroupId: 'GroupId' };
      } else if (instance instanceof AuthorizeSecurityGroupEgressCommand) {
        return { SecurityGroupRules: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }] };
      }
    });

    const ecsClient = await Container.get(ECSClient);
    (ecsClient.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof RegisterTaskDefinitionCommand) {
        return { taskDefinition: { revision: 1, taskDefinitionArn: 'taskDefinitionArn' } };
      } else if (instance instanceof CreateServiceCommand) {
        return { service: { serviceArn: 'serviceArn' } };
      } else if (instance instanceof DeleteTaskDefinitionsCommand) {
        return { failures: [] };
      }
    });

    const efsClient = await Container.get(EFSClient);
    (efsClient.send as jest.Mock).mockImplementation(async (instance) => {
      if (instance instanceof CreateFileSystemCommand) {
        return { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' };
      } else if (instance instanceof CreateMountTargetCommand) {
        return { MountTargetId: 'MountTargetId', NetworkInterfaceId: 'NetworkInterfaceId' };
      }
    });

    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));
    octoAws.registerInputs({
      'input.region.aws-us-east-1a.subnet.private.CidrBlock': '10.0.0.0/16',
      'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
    });

    const app = new App('test');
    const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
    app.addRegion(region);
    const subnet = new AwsSubnet(region, 'private');
    region.addSubnet(subnet);
    const environment = new AwsEnvironment('qa');
    region.addEnvironment(environment);
    const server = new AwsServer('backend');
    app.addServer(server);
    const deployment = new AwsDeployment('0.0.1');
    server.addDeployment(deployment);

    await commit(octoAws, app, { onlyModels: true });

    // Create a new execution.
    const execution = new AwsExecution(deployment, environment, subnet);
    await execution.init();

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           "value": "ecs-task-definition-aws-us-east-1a-backend-0.0.1",
         },
       ],
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "ecs-service-aws-us-east-1a-backend",
         },
       ],
     ]
    `);

    // Add security group rules for the server.
    server.addSecurityGroupRule({
      CidrBlock: '0.0.0.0/0',
      Egress: true,
      FromPort: 8080,
      IpProtocol: 'tcp',
      ToPort: 8080,
    });

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "security-group=sec-grp-backend-SecurityGroup",
           "value": "sec-grp-backend-SecurityGroup",
         },
       ],
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "",
         },
       ],
     ]
    `);

    // Add security group rules for the execution.
    execution.addSecurityGroupRule({
      CidrBlock: '0.0.0.0/0',
      Egress: true,
      FromPort: 8081,
      IpProtocol: 'tcp',
      ToPort: 8081,
    });

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "security-group=sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
           "value": "sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
         },
       ],
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "",
         },
       ],
     ]
    `);

    // Mount filesystem.
    await region.addFilesystem('shared-mounts');
    await subnet.addFilesystemMount('shared-mounts');
    await execution.mountFilesystem('shared-mounts');

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "model": "efs=efs-aws-us-east-1a-shared-mounts",
           "value": "efs-aws-us-east-1a-shared-mounts",
         },
       ],
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           "value": "",
         },
         {
           "action": "add",
           "field": "resourceId",
           "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
           "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
         },
       ],
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "",
         },
       ],
     ]
    `);

    // Update desired count, and remove a security group.
    execution.updateDesiredCount(2);
    execution.removeSecurityGroupRule({
      CidrBlock: '0.0.0.0/0',
      Egress: true,
      FromPort: 8081,
      IpProtocol: 'tcp',
      ToPort: 8081,
    });

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "",
         },
       ],
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "security-group=sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
           "value": "sec-grp-backend-0.0.1-aws-us-east-1a-qa-private-SecurityGroup",
         },
       ],
     ]
    `);

    // Remove security group.
    server.removeSecurityGroupRule({
      CidrBlock: '0.0.0.0/0',
      Egress: true,
      FromPort: 8080,
      IpProtocol: 'tcp',
      ToPort: 8080,
    });
    await execution.unmountFilesystem('shared-mounts');
    await subnet.removeFilesystemMount('shared-mounts');
    await region.removeFilesystem('shared-mounts');

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           "value": "",
         },
         {
           "action": "delete",
           "field": "resourceId",
           "model": "efs-mount-target=efs-mount-aws-us-east-1a-private-shared-mounts",
           "value": "efs-mount-aws-us-east-1a-private-shared-mounts",
         },
       ],
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "efs=efs-aws-us-east-1a-shared-mounts",
           "value": "efs-aws-us-east-1a-shared-mounts",
         },
         {
           "action": "update",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "",
         },
       ],
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "security-group=sec-grp-backend-SecurityGroup",
           "value": "sec-grp-backend-SecurityGroup",
         },
       ],
     ]
    `);

    // Remove execution.
    await execution.destroy();
    execution.remove();

    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "ecs-service=ecs-service-aws-us-east-1a-backend",
           "value": "ecs-service-aws-us-east-1a-backend",
         },
       ],
       [
         {
           "action": "delete",
           "field": "resourceId",
           "model": "ecs-task-definition=ecs-task-definition-aws-us-east-1a-backend-0.0.1",
           "value": "ecs-task-definition-aws-us-east-1a-backend-0.0.1",
         },
       ],
     ]
    `);
  });
});
