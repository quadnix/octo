import { App, DiffMetadata, Environment, LocalStateProvider, Resource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../../src';

const unlinkAsync = promisify(unlink);

describe('Environment E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'aws-us-east-1b-models.json'),
    join(__dirname, 'aws-us-east-1b-resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('general workflow', () => {
    let app: App;
    let region1: AwsRegion;
    let region2: AwsRegion;

    let octoAws1: OctoAws;
    let octoAws2: OctoAws;

    beforeEach(async () => {
      app = new App('test');
      region1 = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region1);
      region2 = new AwsRegion(AwsRegionId.AWS_US_EAST_1B);
      app.addRegion(region2);

      const localStateProvider = new LocalStateProvider(__dirname);
      octoAws1 = new OctoAws(region1, localStateProvider);
      octoAws1.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs1_0 = await octoAws1.diff();
      const generator1 = await octoAws1.beginTransaction(diffs1_0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws1.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

      octoAws2 = new OctoAws(region2, localStateProvider);
      octoAws2.registerInputs({
        'input.region.aws-us-east-1b.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1b.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1b.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs2_0 = await octoAws2.diff();
      const generator2 = await octoAws2.beginTransaction(diffs2_0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws2.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);
    });

    it('should test working with an ECS cluster', async () => {
      const environment1 = new Environment('qa');
      region1.addEnvironment(environment1);

      const diffs1_1 = await octoAws1.diff();
      const generator1 = await octoAws1.beginTransaction(diffs1_1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
      await generator1.next(); // Run real resource actions.
      await octoAws1.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

      // Add environment with same name to another region.
      const environment2 = new Environment('qa');
      region2.addEnvironment(environment2);

      const diffs2_1 = await octoAws2.diff();
      const generator2 = await octoAws2.beginTransaction(diffs2_1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
      await generator2.next(); // Run real resource actions.
      await octoAws2.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);

      // Remove environments.
      environment1.remove();
      environment2.remove();

      const diffs1_2 = await octoAws1.diff();
      const generator3 = await octoAws1.beginTransaction(diffs1_2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });
      const modelTransactionResult3 = (await generator3.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult3 = (await generator3.next()) as IteratorResult<Resource<unknown>[]>;
      await generator3.next(); // Run real resource actions.
      await octoAws1.commitTransaction(modelTransactionResult3.value, resourcesResult3.value);

      const diffs2_2 = await octoAws2.diff();
      const generator4 = await octoAws2.beginTransaction(diffs2_2, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });
      const modelTransactionResult4 = (await generator4.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult4 = (await generator4.next()) as IteratorResult<Resource<unknown>[]>;
      await generator4.next(); // Run real resource actions.
      await octoAws2.commitTransaction(modelTransactionResult4.value, resourcesResult4.value);
    });
  });
});
