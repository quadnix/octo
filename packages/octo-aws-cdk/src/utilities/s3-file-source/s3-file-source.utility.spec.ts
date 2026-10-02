import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  type IManifest,
  type IS3FileExcludePath,
  type IS3FileSourcePath,
  S3FileSourceUtility,
} from './s3-file-source.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resourcesPath = join(__dirname, '../../../resources');
const websiteSourcePath = join(resourcesPath, 's3-static-website');

describe('S3FileSourceUtility UT', () => {
  let excludePaths: IS3FileExcludePath[];
  let sourcePaths: IS3FileSourcePath[];

  beforeEach(() => {
    excludePaths = [];
    sourcePaths = [];
  });

  describe('addSource()', () => {
    describe('when called with directoryPath', () => {
      it('should add the directory when relative path given', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, websiteSourcePath);

        expect(sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
        expect(excludePaths).toEqual([]);
      });

      it('should add the directory when absolute path given', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resolve(websiteSourcePath));

        expect(sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
        expect(excludePaths).toEqual([]);
      });
    });

    it('should add when file path is given in directoryPath', async () => {
      await S3FileSourceUtility.addSource(sourcePaths, excludePaths, websiteSourcePath + '/index.html');

      expect(sourcePaths).toEqual([
        {
          directoryPath: websiteSourcePath,
          isDirectory: false,
          remotePath: 'index.html',
          subDirectoryOrFilePath: 'index.html',
        },
      ]);
      expect(excludePaths).toEqual([]);
    });

    it('should add when file path is given in subDirectoryOrFilePath', async () => {
      await S3FileSourceUtility.addSource(sourcePaths, excludePaths, websiteSourcePath, '/index.html');

      expect(sourcePaths).toEqual([
        {
          directoryPath: websiteSourcePath,
          isDirectory: false,
          remotePath: 'index.html',
          subDirectoryOrFilePath: 'index.html',
        },
      ]);
      expect(excludePaths).toEqual([]);
    });

    describe('when called with directoryPath and subDirectoryOrFilePath', () => {
      it('should add the directory', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, 's3-static-website');

        expect(sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
        expect(excludePaths).toEqual([]);
      });

      it('should add the directory without slashes', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, '/s3-static-website');

        expect(sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
        expect(excludePaths).toEqual([]);
      });
    });

    describe('when called with filter', () => {
      it('should add file when filter allows it', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, websiteSourcePath, 'index.html', () => {
          return true;
        });

        expect(sourcePaths).toEqual([
          {
            directoryPath: websiteSourcePath,
            isDirectory: false,
            remotePath: 'index.html',
            subDirectoryOrFilePath: 'index.html',
          },
        ]);
        expect(excludePaths).toEqual([]);
      });

      it('should not add file when filter blocks it', async () => {
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, websiteSourcePath, 'index.html', () => {
          return false;
        });

        expect(sourcePaths).toEqual([]);
        expect(excludePaths).toEqual([]);
      });

      it('should add directory and record excludes according to filter', async () => {
        await S3FileSourceUtility.addSource(
          sourcePaths,
          excludePaths,
          resourcesPath,
          's3-static-website',
          (filePath: string) => {
            return filePath === 's3-static-website/index.html';
          },
        );

        expect(sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: 's3-static-website',
            subDirectoryOrFilePath: 's3-static-website',
          },
        ]);
        expect(excludePaths).toEqual([
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
        await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, '', (filePath: string) => {
          return filePath === 's3-static-website/index.html';
        });

        expect(sourcePaths).toEqual([
          {
            directoryPath: resourcesPath,
            isDirectory: true,
            remotePath: '',
            subDirectoryOrFilePath: '',
          },
        ]);
        expect(excludePaths).toEqual([
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
        await S3FileSourceUtility.addSource(
          sourcePaths,
          excludePaths,
          resourcesPath,
          's3-static-website',
          undefined,
          (filePath: string) => {
            return 'test/' + filePath;
          },
        );

        expect(sourcePaths).toEqual([
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

  describe('digestManifest()', () => {
    const manifest: IManifest = {
      'error.html': { algorithm: 'sha1', digest: 'digest-error', filePath: '/site/error.html' },
      'index.html': { algorithm: 'sha1', digest: 'digest-index', filePath: '/site/index.html' },
    };

    it('should not depend on the order of the manifest keys', () => {
      const reordered: IManifest = Object.fromEntries(Object.entries(manifest).reverse());
      expect(Object.keys(reordered)).toEqual(['index.html', 'error.html']);

      expect(S3FileSourceUtility.digestManifest(reordered)).toBe(S3FileSourceUtility.digestManifest(manifest));
    });

    it('should change when a file changes', () => {
      const changed: IManifest = { ...manifest, 'index.html': { ...manifest['index.html'], digest: 'digest-index-2' } };

      expect(S3FileSourceUtility.digestManifest(changed)).not.toBe(S3FileSourceUtility.digestManifest(manifest));
    });

    it('should change when a file is added or removed', () => {
      const added: IManifest = {
        ...manifest,
        'page-1.html': { algorithm: 'sha1', digest: 'digest-page-1', filePath: '/site/page-1.html' },
      };
      const removed: IManifest = { 'index.html': manifest['index.html'] };

      expect(S3FileSourceUtility.digestManifest(added)).not.toBe(S3FileSourceUtility.digestManifest(manifest));
      expect(S3FileSourceUtility.digestManifest(removed)).not.toBe(S3FileSourceUtility.digestManifest(manifest));
    });

    it('should change when a file is deleted', () => {
      const deleted: IManifest = { ...manifest, 'error.html': { ...manifest['error.html'], digest: 'deleted' } };

      expect(S3FileSourceUtility.digestManifest(deleted)).not.toBe(S3FileSourceUtility.digestManifest(manifest));
    });
  });

  describe('generateManifest()', () => {
    it('should generate manifest for a file', async () => {
      await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, 'index.html');

      const manifest = await S3FileSourceUtility.generateManifest(sourcePaths, excludePaths);
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
      await S3FileSourceUtility.addSource(
        sourcePaths,
        excludePaths,
        resourcesPath,
        's3-static-website',
        (filePath: string) => {
          return filePath === 's3-static-website/index.html';
        },
      );

      const manifest = await S3FileSourceUtility.generateManifest(sourcePaths, excludePaths);
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
      await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, '', (filePath: string) => {
        return filePath === 's3-static-website/index.html';
      });

      const manifest = await S3FileSourceUtility.generateManifest(sourcePaths, excludePaths);
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
      await S3FileSourceUtility.addSource(sourcePaths, excludePaths, resourcesPath, '', (filePath: string) => {
        return !filePath.startsWith('s3-static-website/');
      });

      const manifest = await S3FileSourceUtility.generateManifest(sourcePaths, excludePaths);
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
