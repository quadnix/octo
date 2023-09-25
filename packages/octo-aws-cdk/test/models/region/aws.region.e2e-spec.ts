import { App, DiffMetadata, LocalStateProvider, Resource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../../src';

const unlinkAsync = promisify(unlink);

describe('AwsRegion E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  it('should test working with an AWS region', async () => {
    const app = new App('test');
    const region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
    app.addRegion(region);

    const localStateProvider = new LocalStateProvider(__dirname);
    const octoAws = new OctoAws(region, localStateProvider);
    octoAws.registerInputs({
      'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '10.0.0.0/24',
      'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '10.0.1.0/24',
      'input.region.aws-us-east-1a.vpc.CidrBlock': '10.0.0.0/16',
    });

    const diffs1_0 = await octoAws.diff();
    const generator1 = await octoAws.beginTransaction(diffs1_0, {
      yieldModelTransaction: true,
      yieldNewResources: true,
    });

    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
    await generator1.next(); // Run real resource actions.
    await octoAws.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

    // Remove region.
    region.remove();

    const diffs1_1 = await octoAws.diff();
    const generator2 = await octoAws.beginTransaction(diffs1_1, {
      yieldModelTransaction: true,
      yieldNewResources: true,
    });

    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
    const resourceTransaction = await generator2.next(); // Run real resource actions.
    await octoAws.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);

    expect(resourceTransaction.value).toMatchInlineSnapshot(`
      [
        [
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
        ],
        [
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
        ],
        [
          {
            "action": "delete",
            "field": "resourceId",
            "value": "aws-us-east-1a-vpc",
          },
        ],
      ]
    `);
  });
});
