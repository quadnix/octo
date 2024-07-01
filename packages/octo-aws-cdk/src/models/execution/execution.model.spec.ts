import { AuthorizeSecurityGroupEgressCommand, CreateSecurityGroupCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  CreateServiceCommand,
  DeleteTaskDefinitionsCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
} from '@aws-sdk/client-ecs';
import { CreateFileSystemCommand, CreateMountTargetCommand, EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
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

    const diffs0 = await octoAws.diff(app);
    const generator0 = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
    });

    // Prevent generator from running real resource actions.
    const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult0.value);

    // Create a new execution.
    const execution = new AwsExecution(deployment, environment, subnet);
    await execution.init();

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

    const diffs2 = await octoAws.diff(app);
    const generator2 = await octoAws.beginTransaction(diffs2, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult2 = await generator2.next();
    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult2.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
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

    const diffs3 = await octoAws.diff(app);
    const generator3 = await octoAws.beginTransaction(diffs3, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult3 = await generator3.next();
    const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult3.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult3.value).toMatchInlineSnapshot(`
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

    const diffs5 = await octoAws.diff(app);
    const generator5 = await octoAws.beginTransaction(diffs5, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult5 = await generator5.next();
    const modelTransactionResult5 = (await generator5.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult5.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult5.value).toMatchInlineSnapshot(`
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

    const diffs6 = await octoAws.diff(app);
    const generator6 = await octoAws.beginTransaction(diffs6, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult6 = await generator6.next();
    const modelTransactionResult6 = (await generator6.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult6.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult6.value).toMatchInlineSnapshot(`
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

    const diffs7 = await octoAws.diff(app);
    const generator7 = await octoAws.beginTransaction(diffs7, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult7 = await generator7.next();
    const modelTransactionResult7 = (await generator7.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult7.value);

    // Verify resource transaction was as expected.
    expect(resourceTransactionResult7.value).toMatchInlineSnapshot(`
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
