import { App, DiffMetadata, LocalStateProvider, Resource } from '@quadnix/octo';
import { existsSync, readFileSync, unlink, writeFile } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../../index.js';
import { S3StaticWebsiteService } from './s3-static-website.service.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3StaticWebsiteService UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
    join(__dirname, 'test-bucket-manifest.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('addSource()', () => {
    let service: S3StaticWebsiteService;

    beforeEach(() => {
      service = new S3StaticWebsiteService(new AwsRegion(AwsRegionId.AWS_US_EAST_1A), 'test-bucket');
    });

    describe('when called with directoryPath', () => {
      it('should add the directory when relative path given', async () => {
        await service.addSource(websiteSourcePath);

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
      });

      it('should add the directory when absolute path given', async () => {
        await service.addSource(resolve(websiteSourcePath));

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
      });
    });

    it('should add when file path is given', async () => {
      await service.addSource(websiteSourcePath + '/index.html');

      expect(service.sourcePaths).toEqual([
        {
          directoryPath: websiteSourcePath,
          isDirectory: false,
          remotePath: 'index.html',
          subDirectoryOrFilePath: 'index.html',
        },
      ]);
    });

    describe('when called with directoryPath and subDirectoryOrFilePath', () => {
      it('should add the directory', async () => {
        await service.addSource(resourcesPath, 's3-static-website');

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
      });

      it('should add the directory without slashes', async () => {
        await service.addSource(resourcesPath, '/s3-static-website');

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
      });
    });

    describe('when called with filter', () => {
      it('should add file when filter allows it', async () => {
        await service.addSource(websiteSourcePath, 'index.html', () => {
          return true;
        });

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: false,
            remotePath: 'index.html',
            subDirectoryOrFilePath: 'index.html',
          },
        ]);
      });

      it('should not add file when filter blocks it', async () => {
        await service.addSource(websiteSourcePath, 'index.html', () => {
          return false;
        });

        expect(service.sourcePaths).toEqual([]);
      });

      it('should add directory and record excludes according to filter', async () => {
        await service.addSource(resourcesPath, 's3-static-website', (filePath: string) => {
          return filePath === 's3-static-website/index.html';
        });

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
        expect(service.excludePaths).toEqual([
          {
            directoryPath: resourcesPath,
            subDirectoryOrFilePath: 's3-static-website/error.html',
          },
          {
            directoryPath: resourcesPath,
            subDirectoryOrFilePath: 's3-static-website/page-1.html',
          },
        ]);
      });
    });

    describe('when called with transform', () => {
      it('should transform directory', async () => {
        await service.addSource(resourcesPath, 's3-static-website', undefined, (filePath: string) => {
          return 'test/' + filePath;
        });

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 'test/s3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
      });
    });
  });

  describe('diff()', () => {
    let app: App;
    let region: AwsRegion;
    let service: S3StaticWebsiteService;

    let octoAws: OctoAws;

    beforeEach(async () => {
      app = new App('test');
      region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region);
      service = new S3StaticWebsiteService(region, 'test-bucket');
      app.addService(service);

      const localStateProvider = new LocalStateProvider(__dirname);
      octoAws = new OctoAws(region, localStateProvider);
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

    it('should generate an update on addition', async () => {
      await service.addSource(websiteSourcePath);

      const diffs1 = await octoAws.diff();

      expect(diffs1).toMatchInlineSnapshot(`
        [
          {
            "action": "update",
            "field": "sourcePaths",
            "value": {
              "error.html": [
                "add",
                "${websiteSourcePath}/error.html",
              ],
              "index.html": [
                "add",
                "${websiteSourcePath}/index.html",
              ],
              "page-1.html": [
                "add",
                "${websiteSourcePath}/page-1.html",
              ],
            },
          },
        ]
      `);
    });

    it('should generate an update on deletion', async () => {
      await service.addSource(`${websiteSourcePath}/error.html`);
      await service.addSource(`${websiteSourcePath}/index.html`);
      await service.addSource(`${websiteSourcePath}/page-1.html`);

      const diffs1 = await octoAws.diff();
      const generator = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

      // Remove a sourcePath from the service in a subsequent update to service.
      service.sourcePaths.forEach((p, index) => {
        if (p.remotePath === 'page-1.html') {
          service.sourcePaths.splice(index, 1);
        }
      });

      const diffs2 = await octoAws.diff();
      expect(diffs2).toMatchInlineSnapshot(`
        [
          {
            "action": "update",
            "field": "sourcePaths",
            "value": {
              "page-1.html": [
                "delete",
                "${websiteSourcePath}/page-1.html",
              ],
            },
          },
        ]
      `);
    });

    it('should generate an update on update', async () => {
      await service.addSource(`${websiteSourcePath}/error.html`);
      await service.addSource(`${websiteSourcePath}/index.html`);
      await service.addSource(`${websiteSourcePath}/page-1.html`);

      const diffs1 = await octoAws.diff();
      const generator = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult = (await generator.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws.commitTransaction(modelTransactionResult.value, resourcesResult.value);

      // Update a sourcePath from the service in a subsequent update to service.
      const originalErrorContent = readFileSync(`${websiteSourcePath}/error.html`);
      await writeFileAsync(`${websiteSourcePath}/error.html`, 'New error content!');

      try {
        const diffs2 = await octoAws.diff();
        expect(diffs2).toMatchInlineSnapshot(`
          [
            {
              "action": "update",
              "field": "sourcePaths",
              "value": {
                "error.html": [
                  "update",
                  "${websiteSourcePath}/error.html",
                ],
              },
            },
          ]
        `);
      } finally {
        // Restore error.html
        await writeFileAsync(`${websiteSourcePath}/error.html`, originalErrorContent);
      }
    });
  });
});
