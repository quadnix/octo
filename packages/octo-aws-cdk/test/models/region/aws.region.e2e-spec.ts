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
  });
});
