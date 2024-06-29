import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
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

    const diffs0 = await octoAws.diff(app);
    const generator0 = await octoAws.beginTransaction(diffs0, {
      yieldModelTransaction: true,
    });

    // Prevent generator from running real resource actions.
    const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult0.value);

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

    const diffs1 = await octoAws.diff(app);
    const generator1 = await octoAws.beginTransaction(diffs1, {
      yieldResourceTransaction: true,
    });

    const resourceTransactionResult1 = await generator1.next();
    const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult1.value);

    // Verify resource transaction was as expected, and no resources were added.
    expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`[]`);
  });
});
