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
import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, OctoAws, RegionId } from '../../index.js';
import { RetryUtility } from '../../utilities/retry/retry.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsRegion UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

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
              "value": "vpc-aws-us-east-1a",
            },
          ],
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "igw-aws-us-east-1a",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-access",
            },
          ],
        ]
      `);

      // Add a new filesystem.
      await region.addFilesystem('shared-mounts');

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
             "value": "efs-aws-us-east-1a-shared-mounts-filesystem",
           },
         ],
       ]
      `);

      // Remove the "shared-mounts" filesystem.
      await region.removeFilesystem('shared-mounts');

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
             "action": "delete",
             "field": "resourceId",
             "value": "efs-aws-us-east-1a-shared-mounts-filesystem",
           },
         ],
       ]
      `);

      // Remove region.
      region.remove();

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
              "value": "igw-aws-us-east-1a",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-access",
            },
          ],
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "vpc-aws-us-east-1a",
            },
          ],
        ]
      `);
    });
  });
});
