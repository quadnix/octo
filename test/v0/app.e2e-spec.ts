import { readFile, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { App, AwsRegion, Environment, Server, Support } from '../../src/v0';

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
        "supports": [],
        "version": "v0",
      }
    `);
  });

  it('should synthesize a region, server, and support', () => {
    const app = new App('test-app');

    const region = new AwsRegion('aws-us-east-1');
    app.addRegion(region);

    const server = new Server('backend');
    app.addServer(server);

    const support = new Support('nginx');
    app.addSupport(support);

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
        "supports": [
          {
            "serverKey": "nginx",
          },
        ],
        "version": "v0",
      }
    `);
  });

  it('should synthesize an environment', () => {
    const app = new App('test-app');

    const region = new AwsRegion('aws-us-east-1');
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
                "environmentVariables": {},
              },
            ],
            "regionId": "aws-us-east-1",
          },
        ],
        "servers": [],
        "supports": [],
        "version": "v0",
      }
    `);
  });

  describe('synth()', () => {
    let filePath;

    afterEach(async () => {
      if (filePath) {
        await unlinkAsync(join(filePath, 'infrastructure.json'));
      }
    });

    it('should be able to write the synthesized output', async () => {
      filePath = __dirname;

      const app = new App('test-app');
      await app.synth(filePath);

      const contents = await readFileAsync(
        join(filePath, 'infrastructure.json'),
      );
      const output = JSON.parse(contents.toString());
      expect(output).toMatchInlineSnapshot(`
              {
                "name": "test-app",
                "regions": [],
                "servers": [],
                "supports": [],
                "version": "v0",
              }
          `);
    });
  });
});
