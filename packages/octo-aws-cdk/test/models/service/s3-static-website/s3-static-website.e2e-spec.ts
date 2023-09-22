import { App, DiffMetadata, LocalStateProvider, Resource } from '@quadnix/octo';
import axios from 'axios';
import { existsSync, unlink, writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws, S3StaticWebsiteService } from '../../../../src';

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

const BUCKET_NAME = 'rash-new-bucket-test-1';

const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3StaticWebsite E2E Test', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
    join(__dirname, `${BUCKET_NAME}-manifest.json`),
  ];

  beforeEach(async () => {
    const app = new App('test-app');
    const region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
    app.addRegion(region);

    const localStateProvider = new LocalStateProvider(__dirname);
    const octoAws = new OctoAws(region, localStateProvider);
    octoAws.registerInputs({
      'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
      'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
      'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
    });

    const diffs0 = await octoAws.diff();
    const generator = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
      yieldNewResources: true,
    });

    // Prevent generator from running real resource actions.
    const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    const resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
    await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  it('should test working with a S3 bucket', async () => {
    // Get previous state.
    const localStateProvider = new LocalStateProvider(__dirname);
    const previousApp = await OctoAws.getPreviousAppWithBoundary(AwsRegionId.AWS_US_EAST_1A, localStateProvider);
    const previousRegion = previousApp!.getChild('region', [
      { key: 'regionId', value: AwsRegionId.AWS_US_EAST_1A },
    ]) as AwsRegion;
    const octoAws = new OctoAws(previousRegion, localStateProvider);

    // Add website.
    const service = new S3StaticWebsiteService(previousRegion, BUCKET_NAME);
    previousApp!.addService(service);

    const diffs1 = await octoAws.diff();
    let generator = await octoAws.beginTransaction(diffs1, {
      yieldModelTransaction: true,
      yieldNewResources: true,
      yieldResourceTransaction: true,
    });

    let modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    let resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
    await generator.next(); // Run real resource actions.
    await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

    // Add files to website.
    await service.addSource(`${websiteSourcePath}/error.html`);
    await service.addSource(`${websiteSourcePath}/index.html`);

    const diffs2 = await octoAws.diff();
    generator = await octoAws.beginTransaction(diffs2, {
      yieldModelTransaction: true,
      yieldNewResources: true,
      yieldResourceTransaction: true,
    });

    modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
    await generator.next(); // Run real resource actions.
    await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

    // Ensure website is available.
    const indexContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
    expect(errorContent.data).toContain('This is an error!');

    // Ensure page edits are captured and uploaded.
    try {
      await writeFileAsync(join(websiteSourcePath, 'error.html'), 'New error content!');
      const diffs3 = await octoAws.diff();

      generator = await octoAws.beginTransaction(diffs3, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceTransaction: true,
      });

      modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
      await generator.next(); // Run real resource actions.
      await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

      const newErrorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
      expect(newErrorContent.data).toContain('New error content!');
    } finally {
      // Restore error.html
      await writeFileAsync(join(websiteSourcePath, 'error.html'), errorContent.data);
    }

    // Remove website.
    service.remove(true);
    const diffs4 = await octoAws.diff();

    generator = await octoAws.beginTransaction(diffs4, {
      yieldModelTransaction: true,
      yieldNewResources: true,
      yieldResourceTransaction: true,
    });

    modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
    await generator.next(); // Run real resource actions.
    await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

    // Ensure website is not available.
    await expect(async () => {
      await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/index.html`);
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"Request failed with status code 404"`);
  });
});
