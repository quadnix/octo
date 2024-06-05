import {
  AssociateRouteTableCommand,
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  CreateSubnetCommand,
  DeleteNetworkAclCommand,
  DeleteNetworkAclEntryCommand,
  DeleteRouteTableCommand,
  DeleteSubnetCommand,
  DescribeNetworkAclsCommand,
  DisassociateRouteTableCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
  ReplaceNetworkAclEntryCommand,
} from '@aws-sdk/client-ec2';
import {
  CreateMountTargetCommand,
  DeleteMountTargetCommand,
  DescribeMountTargetsCommand,
  EFSClient,
} from '@aws-sdk/client-efs';
import { jest } from '@jest/globals';
import {
  App,
  Container,
  DiffMetadata,
  LocalStateProvider,
  SubnetType,
  TestContainer,
  UnknownResource,
} from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAws } from '../../main.js';
import { AwsRegion, AwsSubnet, RegionId } from '../../index.js';
import { Efs } from '../../resources/efs/efs.resource.js';
import { RetryUtility } from '../../utilities/retry/retry.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsSubnet UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

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

    jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (operation) => {
      const isConditionSatisfied = await operation();
      if (isConditionSatisfied) {
        return;
      } else {
        throw new Error('Exhausted all retries for the operation!');
      }
    });
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  describe('diff()', () => {
    let octoAws: OctoAws;

    let app: App;
    let region: AwsRegion;

    beforeEach(async () => {
      octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.subnet.private.CidrBlock': '10.1.0.0/16',
        'input.region.aws-us-east-1a.subnet.public.CidrBlock': '10.0.0.0/16',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      // Add region.
      app = new App('test');
      region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      // Add shared-mounts filesystem.
      await region.addFilesystem('shared-mounts');

      const diffs0 = await octoAws.diff(app);
      const generator0 = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
      const newResources = (await generator0.next()) as IteratorResult<UnknownResource[]>;
      // Mock responses of few resources.
      newResources.value.find((r) => r instanceof Efs && r.properties.filesystemName === 'shared-mounts')!.response = {
        FileSystemId: 'fs-abcdef001',
      };
      await octoAws.commitTransaction(app, modelTransactionResult0.value);
    });

    it('should create new subnet and delete it', async () => {
      const ec2Client = await Container.get(EC2Client);
      (ec2Client.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateSubnetCommand) {
          return { Subnet: { SubnetId: 'subnet-abcdef001' } };
        } else if (instance instanceof CreateRouteTableCommand) {
          return { RouteTable: { RouteTableId: 'RouteTableId' } };
        } else if (instance instanceof AssociateRouteTableCommand) {
          return [{ AssociationId: 'AssociationId' }];
        } else if (instance instanceof CreateRouteCommand) {
          return undefined;
        } else if (instance instanceof DescribeNetworkAclsCommand) {
          return {
            NetworkAcls: [
              {
                Associations: [{ SubnetId: 'subnet-abcdef001' }],
                Entries: [
                  { CidrBlock: '10.0.0.0/0', Egress: true },
                  { CidrBlock: '10.1.0.0/0', Egress: false },
                ],
              },
            ],
          };
        } else if (instance instanceof CreateNetworkAclCommand) {
          return { NetworkAcl: { NetworkAclId: 'NetworkAclId' } };
        } else if (instance instanceof ReplaceNetworkAclAssociationCommand) {
          return { NewAssociationId: 'NewAssociationId' };
        } else if (
          instance instanceof CreateNetworkAclEntryCommand ||
          instance instanceof DeleteNetworkAclEntryCommand ||
          instance instanceof ReplaceNetworkAclEntryCommand
        ) {
          return undefined;
        } else if (instance instanceof DeleteNetworkAclCommand) {
          return undefined;
        } else if (instance instanceof DisassociateRouteTableCommand) {
          return undefined;
        } else if (instance instanceof DeleteRouteTableCommand) {
          return undefined;
        } else if (instance instanceof DeleteSubnetCommand) {
          return undefined;
        }
      });

      const efsClient = await Container.get(EFSClient);
      const mockCounts: { [key: string]: number } = {};
      (efsClient.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateMountTargetCommand) {
          return { MountTargetId: 'MountTargetId', NetworkInterfaceId: 'NetworkInterfaceId' };
        } else if (instance instanceof DescribeMountTargetsCommand) {
          mockCounts[instance.constructor.name] = (mockCounts[instance.constructor.name] ?? 0) + 1;
          if (mockCounts[instance.constructor.name] < 3) {
            // Attempt 1 & 2 are for private and public filesystem mount.
            return { MountTargets: [{ FileSystemId: 'fs-abcdef001', LifeCycleState: 'available' }] };
          } else {
            return { MountTargets: [{ FileSystemId: 'fs-abcdef001', LifeCycleState: 'deleted' }] };
          }
        } else if (instance instanceof DeleteMountTargetCommand) {
          return undefined;
        }
      });

      // Add private subnet.
      const privateSubnet = new AwsSubnet(region, 'private');
      region.addSubnet(privateSubnet);
      // Add public subnet.
      const publicSubnet = new AwsSubnet(region, 'public');
      publicSubnet.subnetType = SubnetType.PUBLIC;
      region.addSubnet(publicSubnet);

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
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "add",
             "field": "resourceId",
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "add",
             "field": "resourceId",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "add",
             "field": "resourceId",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
       ]
      `);

      // Allow public subnet to connect to private subnet.
      publicSubnet.updateNetworkingRules(privateSubnet, true);

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
             "field": "properties",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
               ],
             },
           },
           {
             "action": "update",
             "field": "properties",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
               ],
             },
           },
         ],
       ]
      `);

      // Disable private subnet intra networking.
      privateSubnet.disableSubnetIntraNetwork = true;

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
             "field": "properties",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
                 {
                   "CidrBlock": "10.0.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "allow",
                   "RuleNumber": 10,
                 },
               ],
             },
           },
         ],
       ]
      `);

      // Mount "shared-mounts" in private and public subnet.
      await privateSubnet.addFilesystemMount('shared-mounts');
      await publicSubnet.addFilesystemMount('shared-mounts');

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
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts-filesystem",
           },
           {
             "action": "add",
             "field": "resourceId",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts-filesystem",
           },
         ],
       ]
      `);

      // Unmount "shared-mounts" in private and public subnet.
      await privateSubnet.removeFilesystemMount('shared-mounts');
      await publicSubnet.removeFilesystemMount('shared-mounts');

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
             "value": "efs-mount-aws-us-east-1a-private-shared-mounts-filesystem",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "value": "efs-mount-aws-us-east-1a-public-shared-mounts-filesystem",
           },
         ],
       ]
      `);

      // Disconnect public and private subnet connection..
      publicSubnet.updateNetworkingRules(privateSubnet, false);

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
             "action": "update",
             "field": "properties",
             "value": {
               "key": "entries",
               "value": [
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": false,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
                 {
                   "CidrBlock": "10.1.0.0/16",
                   "Egress": true,
                   "PortRange": {
                     "From": -1,
                     "To": -1,
                   },
                   "Protocol": "-1",
                   "RuleAction": "deny",
                   "RuleNumber": 1,
                 },
               ],
             },
           },
           {
             "action": "update",
             "field": "properties",
             "value": {
               "key": "entries",
               "value": [],
             },
           },
         ],
       ]
      `);

      // Remove private and public subnet.
      await privateSubnet.remove();
      await publicSubnet.remove();

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
             "value": "rt-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "value": "nacl-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "value": "rt-aws-us-east-1a-public",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "value": "nacl-aws-us-east-1a-public",
           },
         ],
         [
           {
             "action": "delete",
             "field": "resourceId",
             "value": "subnet-aws-us-east-1a-private",
           },
           {
             "action": "delete",
             "field": "resourceId",
             "value": "subnet-aws-us-east-1a-public",
           },
         ],
       ]
      `);
    });
  });
});
