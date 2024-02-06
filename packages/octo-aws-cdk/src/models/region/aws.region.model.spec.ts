import { App, DiffMetadata, LocalStateProvider, UnknownResource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, OctoAws, RegionId } from '../../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsRegion UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    it('should create new region and delete it', async () => {
      const octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const app = new App('test');
      const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<UnknownResource[]>;
      // Fabricate resource, as if resource actions ran.
      resourcesResult1.value.find((r) => r.MODEL_NAME === 'efs' && r.MODEL_TYPE === 'resource').response = {
        awsRegionId: 'us-east-1',
        FileSystemArn: 'arn',
        FileSystemId: 'id',
        regionId: RegionId.AWS_US_EAST_1A,
      };
      const resourceDiffsResult1 = await generator1.next();
      await octoAws.commitTransaction(app, modelTransactionResult1.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "vpc-aws-us-east-1a",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "igw-aws-us-east-1a",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "subnet-aws-us-east-1a-private-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "subnet-aws-us-east-1a-public-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "rt-aws-us-east-1a-private-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "rt-aws-us-east-1a-public-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "nacl-aws-us-east-1a-private-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "nacl-aws-us-east-1a-public-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-access",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-internal-open",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-private-closed",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-web",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": undefined,
            },
          ],
        ]
      `);

      // Remove region.
      region.remove();

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(app, modelTransactionResult2.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "vpc-aws-us-east-1a",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "igw-aws-us-east-1a",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "subnet-aws-us-east-1a-private-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "subnet-aws-us-east-1a-public-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-access",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-internal-open",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-private-closed",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "sec-grp-aws-us-east-1a-web",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "rt-aws-us-east-1a-private-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "nacl-aws-us-east-1a-private-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "rt-aws-us-east-1a-public-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "nacl-aws-us-east-1a-public-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": undefined,
            },
          ],
        ]
      `);
    });
  });
});
