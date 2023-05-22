import { readFile, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { App, Region, Server } from '../../src/v0';
import { SYNTH_FILE_NAME } from '../../src/v0/models/app.model';
import { Environment } from '../../src/v0/models/environment.model';

const readFileAsync = promisify(readFile);
const unlinkAsync = promisify(unlink);

describe('App E2E Test', () => {
  it('should synthesize an empty app', () => {
    const app = new App('test-app');

    const output = app.synthReadOnly();
    expect(output).toMatchInlineSnapshot(`
      {
        "name": "test-app",
        "regions": [],
        "servers": [],
      }
    `);
  });

  it('should synthesize a region and a server', () => {
    const app = new App('test-app');

    const region = new Region('aws-us-east-1');
    app.addRegion(region);

    const server = new Server('backend');
    app.addServer(server);

    const output = app.synthReadOnly();
    expect(output).toMatchInlineSnapshot(`
      {
        "name": "test-app",
        "regions": [
          {
            "environments": [],
            "regionId": "aws-us-east-1",
          },
        ],
        "servers": [
          {
            "serverKey": "backend",
          },
        ],
      }
    `);
  });

  it('should synthesize an environment', () => {
    const app = new App('test-app');

    const region = new Region('aws-us-east-1');
    app.addRegion(region);

    const environment = new Environment('qa');
    region.addEnvironment(environment);

    const output = app.synthReadOnly();
    expect(output).toMatchInlineSnapshot(`
      {
        "name": "test-app",
        "regions": [
          {
            "environments": [
              {
                "environmentName": "qa",
              },
            ],
            "regionId": "aws-us-east-1",
          },
        ],
        "servers": [],
      }
    `);
  });

  describe('synth()', () => {
    let filePath;

    afterEach(async () => {
      if (filePath) {
        await unlinkAsync(join(filePath, SYNTH_FILE_NAME));
      }
    });

    it('should be able to write the synthesized output', async () => {
      filePath = __dirname;

      const app = new App('test-app');
      await app.synth(filePath);

      const contents = await readFileAsync(join(filePath, SYNTH_FILE_NAME));
      const output = JSON.parse(contents.toString());
      expect(output).toMatchInlineSnapshot(`
              {
                "name": "test-app",
                "regions": [],
                "servers": [],
              }
          `);
    });
  });
});
