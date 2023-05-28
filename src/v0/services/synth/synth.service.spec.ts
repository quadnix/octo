import { readFile, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { App } from '../../models/app/app.model';
import { Environment } from '../../models/environment/environment.model';
import { AwsRegion } from '../../models/region/aws/region.model';
import { Server } from '../../models/server/server.model';
import { Support } from '../../models/support/support.model';
import { SynthService } from './synth.service';

const readFileAsync = promisify(readFile);
const unlinkAsync = promisify(unlink);

describe('Synth Service UT', () => {
  it('should synthesize an empty app', () => {
    const app = new App('test-app');

    const output = new SynthService(app).synthReadOnly();
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

  it('should synthesize a non-empty app', () => {
    const app = new App('test-app');

    const region = new AwsRegion(app, 'aws-us-east-1');
    app.addRegion(region);

    const environment = new Environment(region, 'qa');
    environment.environmentVariables.set('key', 'value');
    region.addEnvironment(environment);

    app.addServer(new Server(app, 'backend'));
    app.addSupport(new Support(app, 'nginx'));

    const output = new SynthService(app).synthReadOnly();
    expect(output).toMatchInlineSnapshot(`
      {
        "name": "test-app",
        "regions": [
          {
            "environments": [
              {
                "environmentName": "qa",
                "environmentVariables": {
                  "key": "value",
                },
              },
            ],
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

      await new SynthService(app).synth(filePath);

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
