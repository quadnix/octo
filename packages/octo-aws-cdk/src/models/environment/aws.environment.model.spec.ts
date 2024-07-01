import { CreateClusterCommand, DeleteClusterCommand, ECSClient } from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import { App, Container, type DiffMetadata, LocalStateProvider, TestContainer } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
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

      const diffs0 = await octoAws.diff(app);
      const generator0 = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult0 = (await generator0.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult0.value);
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

      const diffs1 = await octoAws.diff(app);
      const generator1 = await octoAws.beginTransaction(diffs1, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult1 = await generator1.next();
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult1.value);

      // Verify resource transaction was as expected.
      expect(resourceTransactionResult1.value).toMatchInlineSnapshot(`
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

      const diffs2 = await octoAws.diff(app);
      const generator2 = await octoAws.beginTransaction(diffs2, {
        yieldResourceTransaction: true,
      });

      const resourceTransactionResult2 = await generator2.next();
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      await octoAws.commitTransaction(app, modelTransactionResult2.value);

      // Verify resource transaction was as expected.
      expect(resourceTransactionResult2.value).toMatchInlineSnapshot(`
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
