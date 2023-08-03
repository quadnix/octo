import {
  App,
  DiffService,
  Image,
  LocalStateProvider,
  SerializationService,
  StateManagementService,
} from '@quadnix/octo';
import { unlink } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AWSRegionId, AwsRegion, OctoAws } from '../../../index';

const unlinkAsync = promisify(unlink);

describe('Image E2E Test', () => {
  const filePaths: string[] = [];

  beforeEach(() => {
    jest.setTimeout(60_000);
  });

  afterEach(async () => {
    await Promise.all(filePaths.map((f) => unlinkAsync(f)));
  });

  it('should test working with an image', async () => {
    // Setup test cleanup.
    filePaths.push(join(__dirname, 'infrastructure.json'));

    // Initialize local state.
    const stateManagementService = StateManagementService.getInstance(new LocalStateProvider(__dirname));

    // Initialize serializer.
    const serializationService = new SerializationService();

    // Initialize Octo AWS.
    const octoAws = new OctoAws(new AwsRegion(AWSRegionId.AWS_US_EAST_1));
    const diffService = new DiffService();
    diffService.registerActions(octoAws.getImageActions());

    // Provide inputs for actions.
    diffService.registerInputs({
      'image.quadnix/test:0.0.1.dockerExecutable': 'docker',
    });

    // Add image.
    const app0 = new App('test-app');
    const image0 = new Image('quadnix/test', '0.0.1', {
      dockerFilePath: join(__dirname, '../../../../../../resources/images/quadnix/nginx/0.0.1/Dockerfile'),
    });
    app0.addImage(image0);

    // Apply image, then revert.
    let transaction0;
    try {
      const diffs0 = await app0.diff();
      transaction0 = await diffService.beginTransaction(diffs0);
      await stateManagementService.saveApplicationState(serializationService.serialize(app0));
      expect(transaction0).toMatchInlineSnapshot(`
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
    } finally {
      if (transaction0) {
        await diffService.rollbackAll(transaction0);
      }
    }
  });
});
