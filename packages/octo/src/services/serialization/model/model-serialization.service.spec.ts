import { TestAnchor, TestOverlay } from '../../../utilities/test-helpers/test-classes.js';
import { commit, create, createTestOverlays } from '../../../utilities/test-helpers/test-models.js';
import { type ModelSerializedOutput } from '../../../app.type.js';
import type { Container } from '../../../functions/container/container.js';
import { TestContainer } from '../../../functions/container/test-container.js';
import { type IDependency } from '../../../functions/dependency/dependency.js';
import { Account } from '../../../models/account/account.model.js';
import { App } from '../../../models/app/app.model.js';
import { Image } from '../../../models/image/image.model.js';
import { Region } from '../../../models/region/region.model.js';
import { Service } from '../../../models/service/service.model.js';
import { Subnet } from '../../../models/subnet/subnet.model.js';
import { OverlayDataRepository } from '../../../overlays/overlay-data.repository.js';
import { ModelSerializationService } from './model-serialization.service.js';

describe('Model Serialization Service UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    const modelSerializationService = new ModelSerializationService();
    modelSerializationService.registerClass('@octo/Account', Account);
    modelSerializationService.registerClass('@octo/App', App);
    modelSerializationService.registerClass('@octo/Image', Image);
    modelSerializationService.registerClass('@octo/Region', Region);
    modelSerializationService.registerClass('@octo/Service', Service);
    modelSerializationService.registerClass('@octo/Subnet', Subnet);
    modelSerializationService.registerClass('@octo/TestAnchor', TestAnchor);
    modelSerializationService.registerClass('@octo/TestOverlay', TestOverlay);
    container.unRegisterFactory(ModelSerializationService);
    container.registerValue(ModelSerializationService, modelSerializationService);
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const service = await container.get(ModelSerializationService);

      const serializedOutput: ModelSerializedOutput = {
        anchors: [],
        dependencies: [
          {
            from: 'app=name',
          } as IDependency,
        ],
        models: {
          'app=name': { className: 'ClassNotExist', model: null },
        } as any,
        overlays: [],
      };

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrow();
    });

    it('should throw error when de-serializing a class with default unSynth', async () => {
      const service = await container.get(ModelSerializationService);

      const serializedOutput: ModelSerializedOutput = {
        anchors: [],
        dependencies: [
          {
            from: 'app=name',
          } as IDependency,
        ],
        models: {
          'app=name': { className: '@octo/Service', model: null },
        } as any,
        overlays: [],
      };

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Method not implemented! Use derived class implementation"`);
    });

    it('should be able to register classes and deserialize', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'] });

      const app_1 = await commit(app);

      expect(app_1.name).toBe('test-app');
    });

    it('should deserialize a single model', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });

      const app_1 = await commit(app);

      expect(app_1.name).toBe('test-app');
    });

    it('should return the serialized root on deserialization', async () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test-app'], region: ['region'] });

      const region_1 = await commit(region);

      expect(region_1.regionId).toBe('region');
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const service = await container.get(ModelSerializationService);

      const {
        app: [app],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        image: ['image'],
        region: ['region'],
        subnet: ['private', 'public:-1'],
      });

      const app_1 = await commit(app);

      const previousDependencies = (await service.serialize(app_1)).dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      const currentDependencies = (await service.serialize(app)).dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      expect(previousDependencies).toEqual(currentDependencies);
    });

    it('should deserialize overlay with multiple anchors of same parent', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      const app_1 = await commit(app);
      expect(overlayDataRepository['newOverlays']).toHaveLength(1);

      const overlay1_1 = overlayDataRepository['newOverlays'][0];
      expect(overlay1_1.getAnchors().map((a) => a.getParent().getContext())).toEqual([
        app_1.getContext(),
        app_1.getContext(),
      ]);
    });

    /**
     * Users are not required to deserialize models and overlays because models and overlays are not diff-ed.
     * This feature is only kept around for future use by Octo web clients.
     * Upon deserialization, a new copy of models are created, and the old overlays are kept in OverlayDataRepository
     * as new overlays. Even the web client would only ever deserialize models and overlays to programmatically
     * read the old state.
     */
    it('should deserialize overlay and ensure it still points to the old models', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      const {
        account: [account],
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'], image: ['image'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      await createTestOverlays({ 'overlay-1': [anchor1] });

      // Before commit the overlay has reference to the app, and the app has no region children.
      expect(overlayDataRepository['newOverlays'][0].getAnchors()[0].getParent().getChildren()['region']).toBe(
        undefined,
      );
      await commit(app);

      // Modify the new app.
      account.addRegion(new Region('region-1'));

      // After commit the overlay is deserialized and the newOverlays still reference the old models.
      // Updates to new models should not be reflected in the old models.
      expect(overlayDataRepository['newOverlays'][0].getAnchors()[0].getParent().getChildren()['region']).toBe(
        undefined,
      );
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', async () => {
      const {
        app: [app],
      } = create({
        account: ['aws,account'],
        app: ['test-app'],
        environment: ['qa'],
        image: ['image'],
        region: ['region-1'],
        server: ['backend'],
      });

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize model anchors', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize only boundary members', async () => {
      const {
        region: [region1],
      } = create({
        account: ['aws,account'],
        app: ['test-app'],
        environment: ['qa', 'qa'],
        region: ['region-1', 'region-2:-1'],
      });

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(region1)).toMatchSnapshot();
    });

    it('should serialize overlay with multiple anchors of same parent', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize two overlay dependencies with each other', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1, overlay2] = await createTestOverlays({ 'overlay-1': [anchor1], 'overlay-2': [anchor2] });
      overlay1.addRelationship(overlay2);

      const service = await container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });
  });
});
