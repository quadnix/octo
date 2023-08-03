import { App, DiffService, LocalStateProvider, SerializationService, StateManagementService } from '@quadnix/octo';
import axios from 'axios';
import { unlink, writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AWSRegionId, AwsRegion, OctoAws, S3StaticWebsiteService } from '../../../index';

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

const BUCKET_NAME = 'rash-new-bucket-test-1';
const WEBSITE_PATH = join(__dirname, '../../../../resources/s3-static-website');

describe('S3StaticWebsite E2E Test', () => {
  const filePaths: string[] = [];

  afterEach(async () => {
    await Promise.all(filePaths.map((f) => unlinkAsync(f)));
  });

  it('should test working with a S3 bucket', async () => {
    // Setup test cleanup.
    filePaths.push(join(__dirname, 'infrastructure.json'));
    filePaths.push(join(__dirname, `${BUCKET_NAME}-manifest.json`));

    // Initialize local state.
    const stateManagementService = StateManagementService.getInstance(new LocalStateProvider(__dirname));

    // Initialize serializer.
    const serializationService = new SerializationService();
    serializationService.registerClass('S3StaticWebsiteService', S3StaticWebsiteService);

    // Initialize Octo AWS.
    const octoAws = new OctoAws(new AwsRegion(AWSRegionId.AWS_US_EAST_1));
    const diffService = new DiffService();
    diffService.registerActions(octoAws.getS3StaticWebsiteActions());

    // Add website.
    const app0 = new App('test-app');
    const service0 = new S3StaticWebsiteService(BUCKET_NAME);
    app0.addService(service0);
    const diffs0 = await app0.diff();
    const transaction0 = await diffService.beginTransaction(diffs0);
    await stateManagementService.saveApplicationState(serializationService.serialize(app0));
    /* eslint-disable spellcheck/spell-checker */
    expect(transaction0).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "add",
            "field": "serviceId",
            "value": "rash-new-bucket-test-1-s3-static-website",
          },
          {
            "action": "update",
            "field": "sourcePaths",
            "value": {},
          },
        ],
      ]
    `);
    /* eslint-enable */

    // Add files to website.
    const app0State = await stateManagementService.getApplicationState();
    const app1 = (await serializationService.deserialize(app0State)) as App;
    const service1 = app1.getChild('service', [
      { key: 'serviceId', value: service0.serviceId },
    ]) as S3StaticWebsiteService;
    await service1.addSource(WEBSITE_PATH);
    const diffs1 = await app1.diff(app0);
    const transaction1 = await diffService.beginTransaction(diffs1);
    await stateManagementService.saveApplicationState(serializationService.serialize(app1));
    /* eslint-disable spellcheck/spell-checker */
    expect(transaction1).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "update",
            "field": "sourcePaths",
            "value": {
              "error.html": {
                "algorithm": "sha1",
                "digest": "747c324737a310ff1c0ff1d3ab90d15cb00b585b",
                "filePath": "${WEBSITE_PATH}/error.html",
              },
              "index.html": {
                "algorithm": "sha1",
                "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
                "filePath": "${WEBSITE_PATH}/index.html",
              },
            },
          },
        ],
      ]
    `);
    /* eslint-enable */

    // Ensure website is available.
    const indexContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/index.html`);
    expect(indexContent.data).toContain('This is my first website!');
    const errorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
    expect(errorContent.data).toContain('This is an error!');

    // Ensure page edits are captured and uploaded.
    const app1State = await stateManagementService.getApplicationState();
    const app2 = (await serializationService.deserialize(app1State)) as App;
    try {
      await writeFileAsync(join(WEBSITE_PATH, 'error.html'), 'New error content!');
      const diffs2 = await app2.diff(app1);

      const transaction2 = await diffService.beginTransaction(diffs2);
      await stateManagementService.saveApplicationState(serializationService.serialize(app2));

      /* eslint-disable spellcheck/spell-checker */
      expect(transaction2).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "update",
              "field": "sourcePaths",
              "value": {
                "error.html": {
                  "algorithm": "sha1",
                  "digest": "a975cdbac77bbb3c9201aa588218c4ca64604b4e",
                  "filePath": "${WEBSITE_PATH}/error.html",
                },
                "index.html": {
                  "algorithm": "sha1",
                  "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
                  "filePath": "${WEBSITE_PATH}/index.html",
                },
              },
            },
          ],
        ]
      `);
      /* eslint-enable */

      const newErrorContent = await axios.get(`http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com/error.html`);
      expect(newErrorContent.data).toContain('New error content!');
    } finally {
      // Restore error.html
      await writeFileAsync(join(WEBSITE_PATH, 'error.html'), errorContent.data);
    }

    // Remove website.
    const app3 = new App('test-app');
    const diffs3 = await app3.diff(app2);
    const transaction3 = await diffService.beginTransaction(diffs3);
    await stateManagementService.saveApplicationState(serializationService.serialize(app3));
    expect(transaction3).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "delete",
            "field": "serviceId",
            "value": "rash-new-bucket-test-1-s3-static-website",
          },
        ],
      ]
    `);
  });
});
