import {
  AssociateRouteTableCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  CreateSubnetCommand,
  DeleteSubnetCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import { App, Container, DiffMetadata, LocalStateProvider, SubnetType, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAws } from '../../main.js';
import { AwsRegion, RegionId } from '../region/aws.region.model.js';
import { AwsSubnet } from './aws.subnet.model.js';

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
    let octoAws: OctoAws;

    let app: App;
    let region: AwsRegion;

    beforeEach(async () => {
      octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
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
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult0.value);
    });

    it('should create new subnet and delete it', async () => {
      const ec2Client = await Container.get(EC2Client);
      (ec2Client.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateSubnetCommand) {
          return { Subnet: { SubnetId: 'SubnetId' } };
        } else if (instance instanceof CreateRouteTableCommand) {
          return { RouteTable: { RouteTableId: 'RouteTableId' } };
        } else if (instance instanceof AssociateRouteTableCommand) {
          return [{ AssociationId: 'AssociationId' }];
        } else if (instance instanceof CreateRouteCommand) {
          return undefined;
        } else if (instance instanceof DeleteSubnetCommand) {
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
      expect(resourceTransactionResult1.value).toMatchInlineSnapshot();

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
      expect(resourceTransactionResult2.value).toMatchInlineSnapshot();

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
      expect(resourceTransactionResult3.value).toMatchInlineSnapshot();

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
      expect(resourceTransactionResult4.value).toMatchInlineSnapshot();
    });
  });
});
