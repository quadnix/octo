import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import axios from 'axios';
import { AwsCloudFrontUtility } from '../utilities/aws/cloudfront/aws-cloudfront.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility, type OctoDefinition } from '../utilities/octo/octo-cli.utility.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-cloudfront-website' };

const BUCKET_NAME = config.AWS_CLOUDFRONT_WEBSITE_BUCKET_NAME;

/**
 * The second version of the site, written where a build tool would write one. It is a directory of
 * its own so that the case changing what is published leaves nothing tracked behind, and it is named
 * relative to the template because that is the directory every `octo` command runs in.
 */
const REVISED_WEBSITE_DIRECTORY = join('.octo', 'website');

const REVISED_INDEX_CONTENT = 'This website was published a second time!';

const ORIGINAL_INDEX_CONTENT = 'This website is served from the edge!';

/**
 * How long a change is given to reach every edge location.
 *
 * An invalidation is accepted immediately and applied over the following minutes, and a distribution
 * AWS reports as `Deployed` is still settling, so every case reading over HTTPS polls rather than
 * reads once.
 */
const EDGE_POLL_ATTEMPTS = 60;

const EDGE_POLL_INTERVAL_IN_MS = 10_000;

/**
 * Reads the distribution's root until it serves the expected content, or gives up.
 *
 * @throws If the content never arrives.
 */
async function waitForEdgeContent(domainName: string, expectedContent: string): Promise<void> {
  for (let attempt = 0; attempt < EDGE_POLL_ATTEMPTS; attempt++) {
    const response = await axios.get(`https://${domainName}/`, { validateStatus: () => true });
    if (response.status === 200 && String(response.data).includes(expectedContent)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, EDGE_POLL_INTERVAL_IN_MS));
  }

  throw new Error(`Distribution "${domainName}" never served "${expectedContent}"!`);
}

jest.setTimeout(3_600_000);

describe('Main E2E', () => {
  const awsCloudFrontUtility = new AwsCloudFrontUtility();
  const environment = {
    AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID,
    AWS_CLOUDFRONT_WEBSITE_BUCKET_NAME: BUCKET_NAME,
  };

  let distributionDomainName: string;
  let distributionId: string;

  it('should serve the website through the distribution', async () => {
    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    const responses = await OctoCliUtility.readCommittedResponses(__dirname);

    expect(responses['@octo/s3-storage']).toEqual({
      Arn: `arn:aws:s3:::${BUCKET_NAME}`,
      awsRegionId: AWS_REGION_ID,
      Bucket: BUCKET_NAME,
      RegionalDomainName: `${BUCKET_NAME}.s3.${AWS_REGION_ID}.amazonaws.com`,
    });

    const distributionResponse = responses['@octo/cloudfront-distribution'];
    distributionDomainName = distributionResponse.DomainName;
    distributionId = distributionResponse.DistributionId;

    expect(distributionId).toMatch(/^E[A-Z0-9]{10,}$/);
    expect(distributionResponse.Arn).toBe(
      `arn:aws:cloudfront::${config.AWS_ACCOUNT_ID}:distribution/${distributionId}`,
    );
    expect(distributionDomainName).toMatch(/^d[a-z0-9]+\.cloudfront\.net$/);
    // The same constant for every distribution, which is why the resource publishes it.
    expect(distributionResponse.HostedZoneId).toBe('Z2FDTNDATAQYW2');

    // The invalidation ran against the real distribution, through the callback terraform makes
    // mid-apply, and its response reached octo state through `data "external"` and the commit.
    const invalidationId = responses['@octo/cloudfront-invalidation'].InvalidationId;
    expect(invalidationId).toMatch(/^I[A-Z0-9]{10,}$/);
    expect(await awsCloudFrontUtility.getInvalidationIds(distributionId)).toEqual([invalidationId]);
    expect(await OctoCliUtility.readStateRecordNames(__dirname)).toEqual([]);

    // The bucket is closed. Its website endpoint is emitted for a public bucket alone, so there is
    // nothing left listening on it.
    await expect(
      axios.get(`http://${BUCKET_NAME}.s3-website-${AWS_REGION_ID}.amazonaws.com/index.html`),
    ).rejects.toThrow();

    await waitForEdgeContent(distributionDomainName, ORIGINAL_INDEX_CONTENT);

    // The distribution is tagged, which is what makes the teardown case below able to see it.
    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);
    expect(taggedArns).toContain(distributionResponse.Arn);
  });

  it('should change nothing when the identical intent is re-applied', async () => {
    const responsesBefore = await OctoCliUtility.readCommittedResponses(__dirname);

    await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

    // Every response octo committed is the one it committed before, which is the whole of what a
    // run that changed nothing leaves behind.
    expect(await OctoCliUtility.readCommittedResponses(__dirname)).toEqual(responsesBefore);
    // Nothing published moved, so the edges were told nothing a second time.
    expect(await awsCloudFrontUtility.getInvalidationIds(distributionId)).toHaveLength(1);
    expect(await OctoCliUtility.readStateRecordNames(__dirname)).toEqual([]);
  });

  it('should invalidate the edges once when the published content changes', async () => {
    await mkdir(join(__dirname, REVISED_WEBSITE_DIRECTORY), { recursive: true });
    await cp(join(__dirname, 'website'), join(__dirname, REVISED_WEBSITE_DIRECTORY), { recursive: true });
    await writeFile(
      join(__dirname, REVISED_WEBSITE_DIRECTORY, 'index.html'),
      `<html lang='en'>\n<head>\n  <title>My Distributed Website</title>\n</head>\n<body>\n<h1>${REVISED_INDEX_CONTENT}</h1>\n</body>\n</html>\n`,
    );

    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'revised-content', (definition) => {
      const storageModule = definition.modules.find((m) => m.moduleId === 'website-storage-module')!;
      storageModule.moduleInputs.directoryPath = REVISED_WEBSITE_DIRECTORY;
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    const responses = await OctoCliUtility.readCommittedResponses(__dirname);

    // One more invalidation, and the distribution itself untouched.
    expect(responses['@octo/cloudfront-distribution'].DistributionId).toBe(distributionId);
    const invalidationIds = await awsCloudFrontUtility.getInvalidationIds(distributionId);
    expect(invalidationIds).toHaveLength(2);
    expect(invalidationIds).toContain(responses['@octo/cloudfront-invalidation'].InvalidationId);
    expect(await OctoCliUtility.readStateRecordNames(__dirname)).toEqual([]);

    await waitForEdgeContent(distributionDomainName, REVISED_INDEX_CONTENT);
  });

  it('should edit the live distribution in place when its price class moves', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'other-price-class', (definition) => {
      const storageModule = definition.modules.find((m) => m.moduleId === 'website-storage-module')!;
      storageModule.moduleInputs.directoryPath = REVISED_WEBSITE_DIRECTORY;
      const cloudFrontModule = definition.modules.find((m) => m.moduleId === 'website-cloudfront-module')!;
      cloudFrontModule.moduleInputs.priceClass = 'PriceClass_200';
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    // Nothing on a distribution is force-new, so this is an update rather than a replacement. A
    // replacement would hand back a distribution id that had moved, and would have taken the site
    // down while it happened.
    const responses = await OctoCliUtility.readCommittedResponses(__dirname);
    expect(responses['@octo/cloudfront-distribution'].DistributionId).toBe(distributionId);
    expect(await awsCloudFrontUtility.getPriceClass(distributionId)).toBe('PriceClass_200');

    // The content did not move, so the edges were told nothing.
    expect(await awsCloudFrontUtility.getInvalidationIds(distributionId)).toHaveLength(2);
  });

  it('should have no resources left after teardown', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'teardown', (definition) => {
      definition.modules = definition.modules.filter(
        (m) => m.moduleId === 'app-module' || m.moduleId === 'account-module',
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);
    expect(taggedArns).toEqual([]);

    await expect(axios.get(`https://${distributionDomainName}/`)).rejects.toThrow();
  });
});
