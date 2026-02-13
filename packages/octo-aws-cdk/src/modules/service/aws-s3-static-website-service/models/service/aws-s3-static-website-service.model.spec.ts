import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { AwsS3StaticWebsiteService } from './aws-s3-static-website-service.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('AwsS3StaticWebsiteService UT', () => {
  let service: AwsS3StaticWebsiteService;

  beforeEach(() => {
    service = new AwsS3StaticWebsiteService('test-bucket');
  });

  describe('addSource()', () => {
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
        expect(service.excludePaths).toEqual([]);
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
        expect(service.excludePaths).toEqual([]);
      });
    });

    it('should add when file path is given in directoryPath', async () => {
      await service.addSource(websiteSourcePath + '/index.html');

      expect(service.sourcePaths).toEqual([
        {
          directoryPath: websiteSourcePath,
          isDirectory: false,
          remotePath: 'index.html',
          subDirectoryOrFilePath: 'index.html',
        },
      ]);
      expect(service.excludePaths).toEqual([]);
    });

    it('should add when file path is given in subDirectoryOrFilePath', async () => {
      await service.addSource(websiteSourcePath, '/index.html');

      expect(service.sourcePaths).toEqual([
        {
          directoryPath: websiteSourcePath,
          isDirectory: false,
          remotePath: 'index.html',
          subDirectoryOrFilePath: 'index.html',
        },
      ]);
      expect(service.excludePaths).toEqual([]);
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
        expect(service.excludePaths).toEqual([]);
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
        expect(service.excludePaths).toEqual([]);
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
        expect(service.excludePaths).toEqual([]);
      });

      it('should not add file when filter blocks it', async () => {
        await service.addSource(websiteSourcePath, 'index.html', () => {
          return false;
        });

        expect(service.sourcePaths).toEqual([]);
        expect(service.excludePaths).toEqual([]);
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

      it('should add directory and record excludes with directories according to filter', async () => {
        await service.addSource(resourcesPath, '', (filePath: string) => {
          return filePath === 's3-static-website/index.html';
        });

        expect(service.sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
        expect(service.excludePaths).toEqual([
          {
            directoryPath: resourcesPath,
            subDirectoryOrFilePath: 'index.html',
          },
          {
            directoryPath: resourcesPath,
            subDirectoryOrFilePath: 's3-static-website',
          },
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

  describe('generateSourceManifest()', () => {
    it('should generate manifest for a file', async () => {
      await service.addSource(resourcesPath, 'index.html');

      const manifest = await service['generateSourceManifest']();
      // eslint-disable-next-line spellcheck/spell-checker
      expect(manifest).toMatchInlineSnapshot(`
       {
         "index.html": {
           "algorithm": "sha1",
           "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
           "filePath": "${resourcesPath}/index.html",
         },
       }
      `);
    });

    it('should generate manifest for a directory', async () => {
      await service.addSource(resourcesPath, 's3-static-website', (filePath: string) => {
        return filePath === 's3-static-website/index.html';
      });

      const manifest = await service['generateSourceManifest']();
      // eslint-disable-next-line spellcheck/spell-checker
      expect(manifest).toMatchInlineSnapshot(`
       {
         "s3-static-website/index.html": {
           "algorithm": "sha1",
           "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
           "filePath": "${resourcesPath}/s3-static-website/index.html",
         },
       }
      `);
    });

    it('should generate manifest for a directory with subdirectories', async () => {
      await service.addSource(resourcesPath, '', (filePath: string) => {
        return filePath === 's3-static-website/index.html';
      });

      const manifest = await service['generateSourceManifest']();
      // eslint-disable-next-line spellcheck/spell-checker
      expect(manifest).toMatchInlineSnapshot(`
       {
         "s3-static-website/index.html": {
           "algorithm": "sha1",
           "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
           "filePath": "${resourcesPath}/s3-static-website/index.html",
         },
       }
      `);
    });

    it('should generate manifest for a directory without excluded subdirectories', async () => {
      await service.addSource(resourcesPath, '', (filePath: string) => {
        return !filePath.startsWith('s3-static-website/');
      });

      const manifest = await service['generateSourceManifest']();
      // eslint-disable-next-line spellcheck/spell-checker
      expect(manifest).toMatchInlineSnapshot(`
       {
         "index.html": {
           "algorithm": "sha1",
           "digest": "aba92cd2086d7ab2f36d3bf5baa269478b941921",
           "filePath": "${resourcesPath}/index.html",
         },
       }
      `);
    });
  });
});
