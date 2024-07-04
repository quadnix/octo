import { jest } from '@jest/globals';
import { App, Image, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import { OctoAws } from '../../index.js';
import { ProcessUtility } from '../../utilities/process/process.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Image UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  let runDetachedProcessMock: jest.MockedFunction<any>;

  beforeEach(() => {
    runDetachedProcessMock = jest.spyOn(ProcessUtility, 'runDetachedProcess');
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    it('should create new image repository and delete it', async () => {
      runDetachedProcessMock.mockReturnValue({
        on: jest.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === 'exit') {
            cb(0);
          }
        }),
        removeAllListeners: jest.fn(),
      });

      const octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
      });

      const app = new App('test');
      const image1 = new Image('quadnix/test', '0.0.1', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image1);

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`[]`);

      // Remove image.
      image1.remove();

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`[]`);
    });
  });
});
