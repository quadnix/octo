import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { AwsS3StaticWebsiteService } from './aws-s3-static-website-service.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('AwsS3StaticWebsiteService UT', () => {
  describe('addSource()', () => {
    let service: AwsS3StaticWebsiteService;

    beforeEach(() => {
      service = new AwsS3StaticWebsiteService('test-bucket');
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
});
