import { CreateClusterCommand, DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import { App, Container, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { commit } from '../../../test/helpers/test-models.js';
import { AwsEnvironment, AwsRegion, OctoAws, RegionId } from '../../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('Environment UT', () => {
  const filePaths: string[] = [join(__dirname, 'models.json'), join(__dirname, 'resources.json')];

  beforeAll(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: ECSClient,
            value: { send: jest.fn() },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  afterAll(() => {
    Container.reset();
  });

  describe('diff()', () => {
    let octoAws: OctoAws;

    let app: App;
    let region: AwsRegion;

    beforeEach(async () => {
      octoAws = new OctoAws();
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      app = new App('test');
      region = new AwsRegion(RegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      await commit(octoAws, app, { onlyModels: true });
    });

    it('should create new environment and delete it', async () => {
      const ecsClient = await Container.get(ECSClient);
      (ecsClient.send as jest.Mock).mockImplementation(async (instance) => {
        if (instance instanceof CreateClusterCommand) {
          return { cluster: { clusterArn: 'clusterArn' } };
        } else if (instance instanceof DeleteClusterCommand) {
          return undefined;
        }
      });

      const environment = new AwsEnvironment('qa');
      region.addEnvironment(environment);

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "add",
             "field": "resourceId",
             "model": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);

      // Remove environment.
      environment.remove();

      await expect(commit(octoAws, app)).resolves.toMatchInlineSnapshot(`
       [
         [
           {
             "action": "delete",
             "field": "resourceId",
             "model": "ecs-cluster=ecs-cluster-aws-us-east-1a-qa",
             "value": "ecs-cluster-aws-us-east-1a-qa",
           },
         ],
       ]
      `);
    });
  });
});
