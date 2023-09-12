import { App, Image, LocalStateProvider } from '@quadnix/octo';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AwsRegionId, OctoAws } from '../../index';
import { AwsRegion } from '../region/aws.region.model';

const unlinkAsync = promisify(unlink);

describe('ECRImage UT', () => {
  const filePaths: string[] = [
    join(__dirname, 'aws-us-east-1a-models.json'),
    join(__dirname, 'aws-us-east-1a-resources.json'),
    join(__dirname, 'shared-resources.json'),
  ];

  afterEach(async () => {
    await Promise.all(filePaths.filter((f) => existsSync(f)).map((f) => unlinkAsync(f)));
  });

  describe('diff()', () => {
    let app: App;
    let region: AwsRegion;

    let octoAws: OctoAws;

    beforeEach(async () => {
      app = new App('test');
      region = new AwsRegion(AwsRegionId.AWS_US_EAST_1A);
      app.addRegion(region);

      const localStateProvider = new LocalStateProvider(__dirname);
      octoAws = new OctoAws(region, localStateProvider);
      octoAws.registerInputs({
        'input.region.aws-us-east-1a.subnet.private1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.subnet.public1.CidrBlock': '0.0.0.0/0',
        'input.region.aws-us-east-1a.vpc.CidrBlock': '0.0.0.0/0',
      });

      const diffs0 = await octoAws.diff();
      const generator = await octoAws.beginTransaction(diffs0, {
        yieldModelTransaction: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = await generator.next();
      const resourceDiffsResult = await generator.next();
      await octoAws.commitTransaction(modelTransactionResult.value, resourceDiffsResult.value);
    });

    it('should create new repository and image when none exist', async () => {
      const image = new Image('quadnix/test', '0.0.1', {
        dockerFilePath: 'path/to/Dockerfile',
      });
      app.addImage(image);
      image.addRelationship('imageId', region, 'regionId');

      octoAws.registerInputs({
        'input.image.quadnix/test:0.0.1.dockerExecutable': 'docker',
      });

      const diffs1 = await octoAws.diff();
      const generator = await octoAws.beginTransaction(diffs1, {
        yieldModelTransaction: true,
        yieldResourceDiffs: true,
      });

      // Prevent generator from running real resource actions.
      const modelTransactionResult = await generator.next();
      const resourceDiffsResult = await generator.next();

      expect(modelTransactionResult.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "imageId",
              "value": "quadnix/test:0.0.1",
            },
          ],
        ]
      `);

      expect(resourceDiffsResult.value).toMatchInlineSnapshot(`
        [
          [
            {
              "action": "add",
              "field": "resourceId",
              "value": "image-quadnix/test:0.0.1",
            },
          ],
        ]
      `);
    });
  });
});
