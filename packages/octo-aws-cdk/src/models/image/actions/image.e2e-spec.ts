import {
  App,
  DiffService,
  Image,
  LocalStateProvider,
  SerializationService,
  StateManagementService,
} from '@quadnix/octo';
import { join } from 'path';
import { OctoAws } from '../../../index';

describe('Image E2E Test', () => {
  it('should test working with an image', async () => {
    // Initialize local state.
    const stateManagementService = StateManagementService.getInstance(new LocalStateProvider(__dirname));

    // Initialize serializer.
    const serializationService = new SerializationService();

    // Initialize Octo AWS.
    const octoAws = new OctoAws('us-east-1');
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
    const diffs0 = await app0.diff();
    const transaction0 = await diffService.beginTransaction(diffs0);
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
  });
});
