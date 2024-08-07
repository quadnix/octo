import { App, type DiffMetadata, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, OctoAws, RegionId } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsRegion E2E Test', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  it('should test working with an AWS region', async () => {
    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));
    octoAws.registerInputs({
      'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '10.0.0.0/24',
      'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '10.0.1.0/24',
      'input.region.aws-us-east-1a.vpc.CidrBlock': '10.0.0.0/16',
    });

    const app = new App('test');
    const region = new AwsRegion(RegionId.AWS_US_EAST_1A);
    app.addRegion(region);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1);

    const modelTransactionResult1 = await generator1.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult1.value as DiffMetadata[][]);

    // Remove region.
    region.remove();

    const diffs2 = await octoAws.diff(app);
    const generator2 = await octoAws.beginTransaction(diffs2, {
      yieldModelTransaction: true,
    });

    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    await generator2.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult2.value);
  }, 300_000);
});
