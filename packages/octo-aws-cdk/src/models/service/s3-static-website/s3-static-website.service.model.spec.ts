import { App, DiffAction, TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { readFileSync, writeFile } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { OctoAwsCdkPackageMock, RegionId } from '../../../index.js';
import { S3WebsiteSaveManifestModule } from '../../../modules/s3-website-save-manifest.module.js';
import { S3StaticWebsiteService } from './s3-static-website.service.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const writeFileAsync = promisify(writeFile);

const resourcesPath = join(__dirname, '../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3StaticWebsiteService UT', () => {
  const stateProvider = new TestStateProvider();

  beforeAll(async () => {
    await TestContainer.create(
      {
        importFrom: [OctoAwsCdkPackageMock],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  describe('addSource()', () => {
    let service: S3StaticWebsiteService;

    beforeEach(() => {
      service = new S3StaticWebsiteService(RegionId.AWS_US_EAST_1A, 'test-bucket');
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
        const directoryPath = join(resourcesPath, 's3-static-website');

        await service.addSource(directoryPath, '', (filePath: string) => {
          return filePath === 'index.html';
        });

        expect(service.sourcePaths).toEqual([
          {
            directoryPath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
        expect(service.excludePaths).toEqual([
          {
            directoryPath,
            subDirectoryOrFilePath: 'error.html',
          },
          {
            directoryPath,
            subDirectoryOrFilePath: 'page-1.html',
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
    let testModuleContainer: TestModuleContainer;

    const TestModule = async ({
      commit = false,
      includeWebsite = false,
    }: Record<string, boolean> = {}): Promise<App> => {
      const app = new App('test');

      if (includeWebsite) {
        const service = new S3StaticWebsiteService(RegionId.AWS_US_EAST_1A, 'test-bucket');
        app.addService(service);
      }

      if (commit) {
        await testModuleContainer.commit(app);
      }
      return app;
    };

    beforeEach(async () => {
      testModuleContainer = new TestModuleContainer({
        captures: {},
      });
      await testModuleContainer.initialize(stateProvider);

      await testModuleContainer.loadModules([
        {
          type: S3WebsiteSaveManifestModule,
        },
      ]);
    });

    afterEach(async () => {
      await testModuleContainer.reset();
    });

    it('should setup app', async () => {
      await expect(TestModule({ commit: true })).resolves.not.toThrow();
    });

    it('should add a new website', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "node": "s3-website=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
         ],
       ]
      `);
    });

    it('should add files to website', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      const service = app.getChildren('service')['service'][0].to as S3StaticWebsiteService;
      await service.addSource(websiteSourcePath);

      expect(
        (await testModuleContainer.commit(app)).modelDiffs[0].find(
          (d) => d.action === DiffAction.UPDATE && d.field === 'sourcePaths',
        ),
      ).toMatchInlineSnapshot(`
       {
         "action": "update",
         "field": "sourcePaths",
         "node": "service=test-bucket-s3-static-website,app=test",
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
       }
      `);
    });

    it('should generate an update on update', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      const service = app.getChildren('service')['service'][0].to as S3StaticWebsiteService;
      await service.addSource(websiteSourcePath);

      const originalErrorContent = readFileSync(`${websiteSourcePath}/error.html`);
      await writeFileAsync(`${websiteSourcePath}/error.html`, 'New error content!');

      try {
        expect(
          (await testModuleContainer.commit(app)).modelDiffs[0].find(
            (d) => d.action === DiffAction.UPDATE && d.field === 'sourcePaths',
          ),
        ).toMatchInlineSnapshot(`
         {
           "action": "update",
           "field": "sourcePaths",
           "node": "service=test-bucket-s3-static-website,app=test",
           "value": {
             "error.html": [
               "update",
               "${websiteSourcePath}/error.html",
             ],
           },
         }
        `);
      } finally {
        // Restore error.html
        await writeFileAsync(`${websiteSourcePath}/error.html`, originalErrorContent);
      }
    });

    it('should generate an update on addition of a complex directory', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      const service = app.getChildren('service')['service'][0].to as S3StaticWebsiteService;
      await service.addSource(resourcesPath);

      expect(
        (await testModuleContainer.commit(app)).modelDiffs[0].find(
          (d) => d.action === DiffAction.UPDATE && d.field === 'sourcePaths',
        ),
      ).toMatchInlineSnapshot(`
       {
         "action": "update",
         "field": "sourcePaths",
         "node": "service=test-bucket-s3-static-website,app=test",
         "value": {
           "error.html": [
             "delete",
             "${resourcesPath}/s3-static-website/error.html",
           ],
           "page-1.html": [
             "delete",
             "${resourcesPath}/s3-static-website/page-1.html",
           ],
           "s3-static-website/error.html": [
             "add",
             "${resourcesPath}/s3-static-website/error.html",
           ],
           "s3-static-website/index.html": [
             "add",
             "${resourcesPath}/s3-static-website/index.html",
           ],
           "s3-static-website/page-1.html": [
             "add",
             "${resourcesPath}/s3-static-website/page-1.html",
           ],
         },
       }
      `);
    });

    it('should generate an update on addition of a complex directory with excludes', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      const service = app.getChildren('service')['service'][0].to as S3StaticWebsiteService;
      await service.addSource(resourcesPath, '', (filePath: string) => {
        return filePath !== 's3-static-website';
      });

      expect(
        (await testModuleContainer.commit(app)).modelDiffs[0].find(
          (d) => d.action === DiffAction.UPDATE && d.field === 'sourcePaths',
        ),
      ).toMatchInlineSnapshot(`
       {
         "action": "update",
         "field": "sourcePaths",
         "node": "service=test-bucket-s3-static-website,app=test",
         "value": {
           "s3-static-website/error.html": [
             "delete",
             "${resourcesPath}/s3-static-website/error.html",
           ],
           "s3-static-website/index.html": [
             "delete",
             "${resourcesPath}/s3-static-website/index.html",
           ],
           "s3-static-website/page-1.html": [
             "delete",
             "${resourcesPath}/s3-static-website/page-1.html",
           ],
         },
       }
      `);
    });

    it('should generate an update on delete of a directory', async () => {
      const app = await TestModule({
        commit: false,
        includeWebsite: true,
      });

      expect(
        (await testModuleContainer.commit(app)).modelDiffs[0].find(
          (d) => d.action === DiffAction.UPDATE && d.field === 'sourcePaths',
        ),
      ).toMatchInlineSnapshot(`
       {
         "action": "update",
         "field": "sourcePaths",
         "node": "service=test-bucket-s3-static-website,app=test",
         "value": {
           "index.html": [
             "delete",
             "${resourcesPath}/index.html",
           ],
         },
       }
      `);
    });

    it('should remove website', async () => {
      const app = await TestModule({
        commit: false,
      });

      expect((await testModuleContainer.commit(app)).resourceTransaction).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "node": "s3-website=bucket-test-bucket",
             "value": "bucket-test-bucket",
           },
         ],
       ]
      `);
    });
  });
});
