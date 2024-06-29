import { App, type DiffMetadata, LocalStateProvider } from '@quadnix/octo';
import axios from 'axios';
import { existsSync, unlink, writeFile } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAws, RegionId, S3StaticWebsiteService } from '../../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

const BUCKET_NAME = 'rash-new-bucket-test-1';

const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3StaticWebsite E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, `${BUCKET_NAME}-manifest.json`),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  it('should test working with a S3 bucket', async () => {
    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));

    const app = new App('test');
    const service = new S3StaticWebsiteService(RegionId.AWS_US_EAST_1A, BUCKET_NAME);
    app.addService(service);

    const diffs0 = await octoAws.diff(app);
    const generator0 = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
    });

    const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
    await generator0.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult0.value);

    // Add files to website.
    await service.addSource(`${websiteSourcePath}/error.html`);
    await service.addSource(`${websiteSourcePath}/index.html`);

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1);

    const modelTransactionResult1 = await generator1.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult1.value as DiffMetadata[][]);

    // Ensure website is available.
    const indexContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
    expect(errorContent.data).toContain('This is an error!');

    // Ensure page edits are captured and uploaded.
    try {
      await writeFileAsync(join(websiteSourcePath, 'error.html'), 'New error content!');

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2);

      const modelTransactionResult2 = await generator2.next(); // Run real resource actions.
      await octoAws.commitTransaction(app, modelTransactionResult2.value as DiffMetadata[][]);

      const newErrorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
      expect(newErrorContent.data).toContain('New error content!');
    } finally {
      // Restore error.html
      await writeFileAsync(join(websiteSourcePath, 'error.html'), errorContent.data);
    }

    // Remove website.
    service.remove();

    const diffs3 = await octoAws.diff(app);
    const generator3 = await octoAws.beginTransaction(diffs3);

    const modelTransactionResult3 = await generator3.next(); // Run real resource actions.
    await octoAws.commitTransaction(app, modelTransactionResult3.value as DiffMetadata[][]);

    // Ensure website is not available.
    await expect(async () => {
      await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/index.html`);
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Request failed with status code 404"`);
  });
});
