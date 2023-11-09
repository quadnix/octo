import { App, DiffMetadata, Environment, LocalStateProvider, Resource, UnknownResource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../index.js';
import { IEcsClusterSharedMetadata } from '../../resources/ecs/ecs-cluster.interface.js';
import { EcsCluster } from '../../resources/ecs/ecs-cluster.resource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('ECRImage UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'models.json'),
    join(__dirname, 'resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    const octoAws = new OctoAws();

    let app: App;
    let region1: AwsRegion;
    let region2: AwsRegion;

    beforeEach(async () => {
      await octoAws.initialize(new LocalStateProvider(__dirname));
      octoAws.registerInputs({
        'input.region.aws-ap-south-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-ap-south-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-ap-south-1a.vpc.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      app = new App('test');
      region1 = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region1);
      region2 = new AwsRegion(AwsRegionId.AWS_AP_SOUTH_1A);
      app.addRegion(region2);

      const diffs = await octoAws.diff(app);
      const generator = await octoAws.beginTransaction(diffs, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult = (await generator.next()) as IteratorResult<UnknownResource[]>;
      await octoAws.commitTransaction(app, modelTransactionResult.value, resourcesResult.value);
    });

    it('should create new environment when none exists', async () => {
      const environment1 = new Environment('qa');
      region1.addEnvironment(environment1);

      let diffs = await octoAws.diff(app);
      let generator = await octoAws.beginTransaction(diffs, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator from running real resource actions.
      let modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
      let resourcesResult = (await generator.next()) as IteratorResult<UnknownResource[]>;
      let resourceDiffsResult = await generator.next();

      // Verify resource diff was as expected.
      expect(resourceDiffsResult.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "ecs-cluster-qa",
            },
          ],
        ]
      `);

      // Fabricate resource, as if resource transaction was applied.
      (resourceDiffsResult1.value[0][0].model as Resource<EcsCluster>).response.sharedMetadataStringified =
        JSON.stringify({
          regions: [{ awsRegionId: region1.nativeAwsRegionId, clusterArn: 'arn', regionId: region1.regionId }],
        } as IEcsClusterSharedMetadata);
      await octoAws1.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

      // Add environment with same name to another region.
      const environment2 = new Environment('qa');
      region2.addEnvironment(environment2);

      const diffs2_1 = await octoAws2.diff();
      const generator2 = await octoAws2.beginTransaction(diffs2_1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<UnknownResource[]>;
      const resourceDiffsResult2 = await generator2.next();

      // Verify resource diff was as expected.
      expect(resourceDiffsResult2.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "ecs-cluster-qa",
            },
          ],
        ]
      `);

      // Fabricate resource, as if resource transaction was applied.
      (resourceDiffsResult2.value[0][0].model as Resource<EcsCluster>).response.sharedMetadataStringified =
        JSON.stringify({
          regions: [
            { awsRegionId: region1.nativeAwsRegionId, clusterArn: 'arn', regionId: region1.regionId },
            { awsRegionId: region2.nativeAwsRegionId, clusterArn: 'arn', regionId: region2.regionId },
          ],
        } as IEcsClusterSharedMetadata);
      await octoAws2.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);

      // Remove environments.
      environment1.remove();
      environment2.remove();

      const diffs1_2 = await octoAws1.diff();
      const generator3 = await octoAws1.beginTransaction(diffs1_2, {
        yieldResourceDiffs: true,
      });
      // Prevent generator3 from running real resource actions.
      const resourceDiffsResult3 = await generator3.next();
      // Verify resource diff was as expected.
      expect(resourceDiffsResult3.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "ecs-cluster-qa",
            },
          ],
        ]
      `);

      const diffs2_2 = await octoAws2.diff();
      const generator4 = await octoAws2.beginTransaction(diffs2_2, {
        yieldResourceDiffs: true,
      });
      // Prevent generator4 from running real resource actions.
      const resourceDiffsResult4 = await generator4.next();
      // Verify resource diff was as expected.
      expect(resourceDiffsResult4.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "delete",
              "field": "resourceId",
              "value": "ecs-cluster-qa",
            },
          ],
        ]
      `);
    });
  });
});
