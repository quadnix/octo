import { App, DiffService, LocalStateProvider, SerializationService, StateManagementService } from '@quadnix/octo';
import { unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AWSRegionId, AwsRegion, OctoAws } from '../../index';

const unlinkAsync = promisify(unlink);

describe('AwsRegion E2E Test', () => {
  const filePaths: string[] = [];

  afterEach(async () => {
    await Promise.all(filePaths.map((f) => unlinkAsync(f)));
  });

  it('should test working with an AWS region', async () => {
    // Setup test cleanup.
    filePaths.push(join(__dirname, 'infrastructure.json'));

    // Initialize local state.
    const stateManagementService = StateManagementService.getInstance(new LocalStateProvider(__dirname));

    // Initialize serializer.
    const serializationService = new SerializationService();
    serializationService.registerClass('AwsRegion', AwsRegion);

    // Create app.
    const app0 = new App('test-app');
    const region0 = new AwsRegion(AWSRegionId.AWS_US_EAST_1);
    app0.addRegion(region0);

    // Initialize Octo AWS.
    const octoAws = new OctoAws(region0);
    const diffService = new DiffService();
    diffService.registerActions(octoAws.getRegionActions());

    // Apply app.
    const diffs0 = await app0.diff();
    const transaction0 = await diffService.beginTransaction(diffs0);
    await stateManagementService.saveApplicationState(serializationService.serialize(app0));
    expect(transaction0).toMatchInlineSnapshot(`
      [
        [
          {
            "action": "add",
            "field": "regionId",
            "value": "aws-us-east-1",
          },
        ],
      ]
    `);
  });
});
