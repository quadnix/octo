import {
  AttachInternetGatewayCommand,
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateInternetGatewayCommand,
  CreateSecurityGroupCommand,
  CreateVpcCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { CreateFileSystemCommand, EFSClient } from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import { App, Container, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import { AwsRegion, OctoAws, RegionId } from '../../index.js';
import { RetryUtility } from '../../utilities/retry/retry.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsRegion UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  let retryPromiseMock: jest.MockedFunction<any>;

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: EC2Client,
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
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  describe('diff()', () => {
    it('should create new region and delete it', async () => {
      (retryPromiseMock as jest.Mock).mockResolvedValue(undefined as never);

      const ec2Client = await Container.get(EC2Client);
      (ec2Client.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateVpcCommand) {
          return { Vpc: { VpcId: 'VpcId' } };
        } else if (instance instanceof CreateInternetGatewayCommand) {
          return { InternetGateway: { InternetGatewayId: 'InternetGatewayId' } };
        } else if (instance instanceof AttachInternetGatewayCommand) {
          return undefined;
        } else if (instance instanceof CreateSecurityGroupCommand) {
          return { GroupId: 'GroupId' };
        } else if (
          instance instanceof AuthorizeSecurityGroupEgressCommand ||
          instance instanceof AuthorizeSecurityGroupIngressCommand
        ) {
          return { SecurityGroupRules: [{ SecurityGroupRuleId: 'SecurityGroupRuleId' }] };
        }
      });

      const efsClient = await Container.get(EFSClient);
      (efsClient.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateFileSystemCommand) {
          return { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' };
        }
      });

      const octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "vpc=vpc-aws-us-east-1a",
             "value": "vpc-aws-us-east-1a",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "internet-gateway=igw-aws-us-east-1a",
             "value": "igw-aws-us-east-1a",
           },
           {
             "action": "add",
             "field": "resourceId",
             "model": "security-group=sec-grp-aws-us-east-1a-access",
             "value": "sec-grp-aws-us-east-1a-access",
           },
         ],
       ]
      `);

      // Add a new filesystem.
      await region.addFilesystem('shared-mounts');

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
       ]
      `);

      // Remove the "shared-mounts" filesystem.
      await region.removeFilesystem('shared-mounts');

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "efs=efs-aws-us-east-1a-shared-mounts",
             "value": "efs-aws-us-east-1a-shared-mounts",
           },
         ],
       ]
      `);

      // Remove region.
      region.remove();

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "internet-gateway=igw-aws-us-east-1a",
             "value": "igw-aws-us-east-1a",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "model": "security-group=sec-grp-aws-us-east-1a-access",
             "value": "sec-grp-aws-us-east-1a-access",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "vpc=vpc-aws-us-east-1a",
             "value": "vpc-aws-us-east-1a",
           },
         ],
       ]
      `);
    });
  });
});
