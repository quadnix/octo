import { join, resolve } from 'path';
import { App, SerializationService } from '@quadnix/octo';
import { S3StaticWebsiteService } from './s3-static-website.service.model';

const resourcesPath = resolve(join(__dirname, '../../../../../resources'));
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3StaticWebsiteService UT', () => {
  describe('addSource()', () => {
    let service: S3StaticWebsiteService;

    beforeEach(() => {
      service = new S3StaticWebsiteService('test-bucket');
    });

    describe('when called with directoryPath', () => {
      it('should add the directory', async () => {
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
    it('should generate an addition', async () => {
      const app = new App('test');
      const service = new S3StaticWebsiteService('test-bucket');
      app.addService(service);
      await service.addSource(websiteSourcePath);

      const diffs = app.diff().map((diff) => diff.toJSON());

      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "serviceId",
            "value": "test-bucket-s3-static-website",
          },
          {
            "action": "add",
            "field": "sourcePaths",
            "value": {
              "directoryPath": "${websiteSourcePath}",
              "isDirectory": true,
              "remotePath": "",
              "subDirectoryOrFilePath": "",
            },
          },
        ]
      `);
    });

    it('should generate a deletion', async () => {
      const serializationService = new SerializationService();
      serializationService.registerClass(S3StaticWebsiteService.name, S3StaticWebsiteService);

      const oldApp = new App('test');
      const oldService = new S3StaticWebsiteService('test-bucket');
      oldApp.addService(oldService);
      await oldService.addSource(websiteSourcePath);

      // Remove a sourcePath from the service in a subsequent update to service.
      const newApp = (await serializationService.deserialize(serializationService.serialize(oldApp))) as App;
      const newService: S3StaticWebsiteService = newApp.getChild('service', [
        { key: 'serviceId', value: oldService.serviceId },
      ]) as S3StaticWebsiteService;
      while (newService.sourcePaths.length > 0) {
        newService.sourcePaths.pop();
      }

      const diffs = newApp.diff(oldApp).map((diff) => diff.toJSON());

      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "sourcePaths",
            "value": {
              "directoryPath": "${websiteSourcePath}",
              "isDirectory": true,
              "remotePath": "",
              "subDirectoryOrFilePath": "",
            },
          },
        ]
      `);
    });

    it('should generate an update', async () => {
      const serializationService = new SerializationService();
      serializationService.registerClass(S3StaticWebsiteService.name, S3StaticWebsiteService);

      const oldApp = new App('test');
      const oldService = new S3StaticWebsiteService('test-bucket');
      oldApp.addService(oldService);
      await oldService.addSource(websiteSourcePath);

      const newApp = (await serializationService.deserialize(serializationService.serialize(oldApp))) as App;

      const diffs = newApp.diff(oldApp).map((diff) => diff.toJSON());

      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "update",
            "field": "sourcePaths",
            "value": {
              "directoryPath": "${websiteSourcePath}",
              "isDirectory": true,
              "remotePath": "",
              "subDirectoryOrFilePath": "",
            },
          },
        ]
      `);
    });
  });
});
