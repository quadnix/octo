import {
  Account,
  App,
  Container,
  Deployment,
  Environment,
  Execution,
  Filesystem,
  Image,
  Pipeline,
  Region,
  Server,
  Subnet,
  TestContainer,
} from '../src/index.js';
import { ModelSerializationService } from '../src/services/serialization/model/model-serialization.service.js';
import { TestAnchor, TestOverlay } from '../src/utilities/test-helpers/test-classes.js';
import { create } from '../src/utilities/test-helpers/test-models.js';
import { createTestOverlays } from '../src/utilities/test-helpers/test-overlays.js';

describe('App Serialization and Deserialization E2E Test', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    const modelSerializationService = new ModelSerializationService();
    modelSerializationService.registerClass('@octo/Account', Account);
    modelSerializationService.registerClass('@octo/App', App);
    modelSerializationService.registerClass('@octo/Deployment', Deployment);
    modelSerializationService.registerClass('@octo/Environment', Environment);
    modelSerializationService.registerClass('@octo/Execution', Execution);
    modelSerializationService.registerClass('@octo/Filesystem', Filesystem);
    modelSerializationService.registerClass('@octo/Image', Image);
    modelSerializationService.registerClass('@octo/Pipeline', Pipeline);
    modelSerializationService.registerClass('@octo/Region', Region);
    modelSerializationService.registerClass('@octo/Server', Server);
    modelSerializationService.registerClass('@octo/Subnet', Subnet);
    modelSerializationService.registerClass('@octo/TestAnchor', TestAnchor);
    modelSerializationService.registerClass('@octo/TestOverlay', TestOverlay);
    container.unRegisterFactory(ModelSerializationService);
    container.registerValue(ModelSerializationService, modelSerializationService);
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  it('should serialize and deserialize a complex app', async () => {
    // Create an initial state of the app.
    const {
      app: [app],
      account: [account1],
    } = create({
      account: ['aws,account1', 'aws,account2:-1', 'aws,account3:-2'],
      app: ['test-app'],
      deployment: ['v1'],
      environment: [
        'qa1',
        'staging1:-1',
        'qa2:-1',
        'staging2:-2',
        'qa3:-2',
        'staging3:-3',
        'qa4:-3',
        'staging4:-4',
        'qa5:-4',
        'staging5:-5',
        'qa6:-5',
        'staging6:-6',
      ],
      execution: [':0:0:0'],
      filesystem: ['filesystem'],
      image: ['image'],
      pipeline: ['pipeline'],
      region: ['region1', 'region2:-1', 'region3:-1', 'region4:-2', 'region5:-2', 'region6:-3'],
      server: ['backend'],
      subnet: [
        'public1',
        'private1:-1',
        'public2:-1',
        'private2:-2',
        'public3:-2',
        'private3:-3',
        'public4:-3',
        'private4:-4',
        'public5:-4',
        'private5:-5',
        'public6:-5',
        'private6:-6',
      ],
    });

    // Add anchor - parent=model | location=model
    const account1TestAnchor = new TestAnchor('Account1TestAnchor', {}, account1);
    account1.addAnchor(account1TestAnchor);

    // Add anchor - parent=model | location=overlay
    const { '@octo/test-overlay=account1-overlay': account1Overlay } = await createTestOverlays([
      { anchors: [account1TestAnchor], context: '@octo/test-overlay=account1-overlay' },
    ]);

    // Add anchor - parent=overlay | location=model
    const account1OverlayTestAnchor = new TestAnchor('Account1OverlayTestAnchor', {}, account1Overlay);
    account1.addAnchor(account1OverlayTestAnchor);

    // Add anchor - parent=overlay | location=overlay
    await createTestOverlays([
      { anchors: [account1OverlayTestAnchor], context: '@octo/test-overlay=environment1-overlay' },
    ]);

    const modelSerializationService = await Container.getInstance().get(ModelSerializationService);
    const appSerializedOutput = await modelSerializationService.serialize(app);

    const deserializedApp = await modelSerializationService.deserialize(appSerializedOutput);
    const deserializedAppSerializedOutput = await modelSerializationService.serialize(deserializedApp);

    appSerializedOutput.dependencies = appSerializedOutput.dependencies.sort((a, b) =>
      a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
    );
    deserializedAppSerializedOutput.dependencies = deserializedAppSerializedOutput.dependencies.sort((a, b) =>
      a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
    );
    expect(appSerializedOutput).toEqual(deserializedAppSerializedOutput);
  });
});
