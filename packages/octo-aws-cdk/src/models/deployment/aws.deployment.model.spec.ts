import { App, Container, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import { AwsDeployment, AwsServer, OctoAws } from '../../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('AwsDeployment UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  it('should test e2e', async () => {
    const octoAws = new OctoAws();
    await octoAws.initialize(new LocalStateProvider(__dirname));

    // Add a S3StorageService, and a Server.
    const app = new App('test');
    const server = new AwsServer('Backend');
    app.addServer(server);

    await commit(octoAws, app, { onlyModels: true });

    // Add a deployment.
    const deployment = new AwsDeployment('v0.0.1');
    server.addDeployment(deployment);

    // Verify the anchor was added with default values.
    expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
     {
       "image": {
         "command": "",
         "ports": [],
         "uri": "",
       },
     }
    `);

    // Update deployment with a new image.
    deployment.updateDeploymentImage({
      command: 'command',
      ports: [{ containerPort: 80, protocol: 'tcp' }],
      uri: 'uri',
    });

    // Verify the anchor was updated with new values.
    expect(deployment.getAnchor('TaskDefinitionAnchor')!.properties).toMatchInlineSnapshot(`
     {
       "image": {
         "command": "command",
         "ports": [
           {
             "containerPort": 80,
             "protocol": "tcp",
           },
         ],
         "uri": "uri",
       },
     }
    `);

    // Verify resource transaction was as expected, and no resources were added.
    await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`[]`);
  });
});
