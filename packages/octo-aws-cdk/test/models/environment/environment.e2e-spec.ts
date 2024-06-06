import { App, type DiffMetadata, Environment, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, OctoAws, RegionId } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Environment E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('general workflow', () => {
    let octoAws: OctoAws;

    let app: App;
    let region: AwsRegion;

    beforeEach(async () => {
      octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      app = new App('test');
      region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      const diffs0 = await octoAws.diff(app);
      const generator0 = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult0.value);
    });

    it('should test working with an Environment', async () => {
      const environment = new Environment('qa');
      region.addEnvironment(environment);

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1);

      const modelTransactionResult1 = await generator1.next(); // Run real resource actions.
      await octoAws.commitTransaction(app, modelTransactionResult1.value as DiffMetadata[][]);

      // Remove environments.
      environment.remove();

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2);
      const modelTransactionResult2 = await generator2.next(); // Run real resource actions.
      await octoAws.commitTransaction(app, modelTransactionResult2.value as DiffMetadata[][]);
    });
  });
});
