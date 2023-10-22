import { App, DiffMetadata, Environment, LocalStateProvider, Resource } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegion, AwsRegionId, OctoAws } from '../../index';
import { IEcsClusterSharedMetadata } from '../../resources/ecs/ecs-cluster.interface';
import { EcsCluster } from '../../resources/ecs/ecs-cluster.resource';

const unlinkAsync = promisify(unlink);

describe('ECRImage UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-ap-south-1a-models.json'),
    join(__dirname, 'aws-ap-south-1a-resources.json'),
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    let app: App;
    let region1: AwsRegion;
    let region2: AwsRegion;

    let octoAws1: OctoAws;
    let octoAws2: OctoAws;

    beforeEach(async () => {
      app = new App('test');
      region1 = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region1);
      region2 = new AwsRegion(AwsRegionId.AWS_AP_SOUTH_1A);
      app.addRegion(region2);

      const localStateProvider = new LocalStateProvider(__dirname);
      octoAws1 = new OctoAws(region1, localStateProvider);
      octoAws1.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs1_0 = await octoAws1.diff();
      const generator1 = await octoAws1.beginTransaction(diffs1_0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws1.commitTransaction(modelTransactionResult1.value, resourcesResult1.value);

      octoAws2 = new OctoAws(region2, localStateProvider);
      octoAws2.registerInputs({
        'input.region.aws-ap-south-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-ap-south-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-ap-south-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs2_0 = await octoAws2.diff();
      const generator2 = await octoAws2.beginTransaction(diffs2_0, {
        yieldModelTransaction: true,
        yieldNewResources: true,
      });

      // Prevent generator2 from running real resource actions.
      const modelTransactionResult2 = (await generator2.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
      await octoAws2.commitTransaction(modelTransactionResult2.value, resourcesResult2.value);
    });

    it('should create new environment when none exists', async () => {
      const environment1 = new Environment('qa');
      region1.addEnvironment(environment1);

      const diffs1_1 = await octoAws1.diff();
      const generator1 = await octoAws1.beginTransaction(diffs1_1, {
        yieldModelTransaction: true,
        yieldNewResources: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator1 from running real resource actions.
      const modelTransactionResult1 = (await generator1.next()) as IteratorResult<DiffMetadata[][]>;
      const resourcesResult1 = (await generator1.next()) as IteratorResult<Resource<unknown>[]>;
      const resourceDiffsResult1 = await generator1.next();

      // Verify resource diff was as expected.
      expect(resourceDiffsResult1.value).toMatchInlineSnapshot(`
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
      const resourcesResult2 = (await generator2.next()) as IteratorResult<Resource<unknown>[]>;
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