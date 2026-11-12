import { cp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import axios from 'axios';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-s3-website' };

const BUCKET_NAME = config.AWS_S3_WEBSITE_BUCKET_NAME;

const WEBSITE_URL = `http://${BUCKET_NAME}.s3-website-${AWS_REGION_ID}.amazonaws.com`;

/**
 * A copy of `website`, published in its place, so a case can edit a file the way a user does and
 * leave nothing tracked behind. Relative to the template, the directory every `octo` command runs in.
 */
const WEBSITE_DIRECTORY = join('.octo', 'website');

jest.setTimeout(900_000);

describe('Main E2E', () => {
  const environment = { AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID, AWS_S3_WEBSITE_BUCKET_NAME: BUCKET_NAME };

  let definitionFilePath: string;

  beforeAll(async () => {
    await rm(join(__dirname, WEBSITE_DIRECTORY), { force: true, recursive: true });
    await cp(join(__dirname, 'website'), join(__dirname, WEBSITE_DIRECTORY), { recursive: true });
    definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'published', (definition) => {
      definition.modules.find((module) => module.moduleId === 's3-website-service-module')!.moduleInputs.directoryPath =
        WEBSITE_DIRECTORY;
    });
  });

  it('should serve the website from the bucket', async () => {
    const report = await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);
    expect(report.failures).toEqual([]);

    const [bucket] = await OctoCliUtility.readCommittedResponsesOf(__dirname, '@octo/s3-website');
    expect(bucket).toEqual({
      Arn: `arn:aws:s3:::${BUCKET_NAME}`,
      awsRegionId: AWS_REGION_ID,
      RegionalDomainName: `${BUCKET_NAME}.s3.${AWS_REGION_ID}.amazonaws.com`,
    });
    expect((await axios.get(`${WEBSITE_URL}/index.html`)).data).toContain('This is my first website!');
    expect((await axios.get(`${WEBSITE_URL}/error.html`)).data).toContain('This is an error!');
  });

  it('should plan nothing when the applied intent is planned again', async () => {
    const report = await OctoCliUtility.validate(__dirname, definitionFilePath, environment);

    expect(report.confidence).toBe('exact');
    expect(report.changes).toEqual([]);
    expect(report.drift).toEqual([]);
  });

  it('should publish a changed file, and only that file', async () => {
    await writeFile(join(__dirname, WEBSITE_DIRECTORY, 'index.html'), 'This website was published again!');

    const report = await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    expect(report.failures).toEqual([]);
    expect(report.changes).toEqual([
      {
        action: 'update',
        address: expect.stringMatching(/^aws_s3_object\.\S+_file_indexhtml$/),
        fields: expect.any(Array),
      },
    ]);
    expect(report.changes[0].fields).toContain('etag');
    expect((await axios.get(`${WEBSITE_URL}/index.html`)).data).toContain('This website was published again!');
  });

  it('should have no resources left after teardown', async () => {
    const teardownFilePath = await OctoCliUtility.writeDefinition(__dirname, 'teardown', (definition) => {
      definition.modules = definition.modules.filter((module) =>
        ['account-module', 'app-module'].includes(module.moduleId),
      );
    });
    await OctoCliUtility.lifecycle(__dirname, teardownFilePath, environment);

    expect(await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS)).toEqual([]);
    await expect(axios.get(`${WEBSITE_URL}/index.html`)).rejects.toThrow();
  });
});
