import { App, DiffMetadata, Image, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { EcrService, OctoAws, RegionId } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Image & ECRService E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  it('should test working with an Image and ECR', async () => {
    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));
    octoAws.registerInputs({
      'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
    });

    const app = new App('test');
    const image1 = new Image('quadnix/test', '0.0.1', {
      dockerfilePath: join(__dirname, '../../../../../resources/images/quadnix/nginx/0.0.1/Dockerfile'),
    });
    app.addImage(image1);
    const service = new EcrService('quadnix/test');
    service.addRegion(RegionId.AWS_US_EAST_1A);
    service.addImage(image1);
    app.addService(service);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1, {
      yieldModelTransaction: true,
    });

    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    await generator1.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult1.value);

    // Remove image.
    service.removeImage('quadnix/test', '0.0.1');

    const diffs2 = await octoAws.diff(app);
    const generator2 = await octoAws.beginTransaction(diffs2, {
      yieldModelTransaction: true,
    });

    const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
    await generator2.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult2.value);
  }, 60_000);
});
