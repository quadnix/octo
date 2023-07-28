import { App, DiffService, LocalStateProvider, StateManagementService } from '@quadnix/octo';
import axios from 'axios';
import { writeFile } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { OctoAws } from '../../../../index';
import { S3StaticWebsiteService } from './s3-static-website.service.model';

const writeFileAsync = promisify(writeFile);

const BUCKET_NAME = 'rash-new-bucket-test-1';
const WEBSITE_PATH = join(__dirname, '../../../../../resources/s3-static-website');

describe('S3StaticWebsite E2E Test', () => {
  it('should test working with a S3 bucket', async () => {
    // Initialize local state.
    StateManagementService.getInstance(new LocalStateProvider(__dirname));

    // Initialize Octo AWS.
    const octoAws = new OctoAws('us-east-1');
    const diffService = new DiffService();
    diffService.registerActions(octoAws.getS3StaticWebsiteActions());

    // Create app.
    const app = new App('test-app');
    const s3StaticWebsiteService = new S3StaticWebsiteService(BUCKET_NAME);
    await s3StaticWebsiteService.addSource(WEBSITE_PATH);
    app.addService(s3StaticWebsiteService);

    // Calculate diff.
    const diffs = await app.diff();
    await diffService.beginTransaction(diffs);
    /* eslint-disable spellcheck/spell-checker */
    expect(diffService.getTransaction()).toMatchInlineSnapshot(`
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
            "value": {
              "error.html": {
                "algorithm": "sha1",
                "digest": "747c324737a310ff1c0ff1d3ab90d15cb00b585b",
                "filePath": "${resolve(WEBSITE_PATH)}/error.html",
              },
              "index.html": {
                "algorithm": "sha1",
                "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
                "filePath": "${resolve(WEBSITE_PATH)}/index.html",
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
    try {
      await writeFileAsync(join(WEBSITE_PATH, 'error.html'), 'New error content!');

      const newDiffs = await app.diff(app);
      const newDiffService = new DiffService();
      newDiffService.registerActions(octoAws.getS3StaticWebsiteActions());

      await newDiffService.beginTransaction(newDiffs);
      /* eslint-disable spellcheck/spell-checker */
      expect(newDiffService.getTransaction()).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "update",
              "field": "sourcePaths",
              "value": {
                "error.html": {
                  "algorithm": "sha1",
                  "digest": "a975cdbac77bbb3c9201aa588218c4ca64604b4e",
                  "filePath": "${resolve(WEBSITE_PATH)}/error.html",
                },
                "index.html": {
                  "algorithm": "sha1",
                  "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
                  "filePath": "${resolve(WEBSITE_PATH)}/index.html",
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
      await writeFileAsync(join(WEBSITE_PATH, 'error.html'), errorContent.data);
    }
  });
});
