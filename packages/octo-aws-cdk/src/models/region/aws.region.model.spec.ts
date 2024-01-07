import { App, DiffMetadata, LocalStateProvider, UnknownResource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../index.js';

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
      const region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
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
        regionId: AwsRegionId.AWS_US_EAST_1A,
      };
      const resourceDiffsResult1 = await generator1.next();
      await octoAws.commitTransaction(app, modelTransactionResult1.value, resourcesResult1.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-vpc",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-igw",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-subnet-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-subnet-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-rt-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-rt-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-nacl-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-nacl-1",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-access-sg",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-internal-open-sg",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-closed-sg",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-web-sg",
            },
            {
              "action": "add",
              "field": "resourceId",
              "value": "aws-us-east-1a-efs-filesystem",
            },
          ],
        ]
      `);

      // Remove region.
      region.remove();

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult2 = await generator2.next();
      await octoAws.commitTransaction(app, modelTransactionResult2.value, resourcesResult2.value);

      // Verify resource diff was as expected.
      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-vpc",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-igw",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-subnet-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-subnet-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-access-sg",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-internal-open-sg",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-closed-sg",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-web-sg",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-rt-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-private-nacl-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-rt-1",
            },
            {
              "action": "delete",
              "field": "resourceId",
              "value": "aws-us-east-1a-public-nacl-1",
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
