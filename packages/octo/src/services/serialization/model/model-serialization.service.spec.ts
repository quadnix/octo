import { TestAnchor, TestOverlay } from '../../../../test/helpers/test-classes.js';
import { commit, create, createTestOverlays } from '../../../../test/helpers/test-models.js';
import { type ModelSerializedOutput } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { type IDependency } from '../../../functions/dependency/dependency.js';
import { App } from '../../../models/app/app.model.js';
import { Image } from '../../../models/image/image.model.js';
import { Region } from '../../../models/region/region.model.js';
import { Service } from '../../../models/service/service.model.js';
import { Subnet } from '../../../models/subnet/subnet.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../../overlays/overlay-data.repository.js';
import { OverlayService, OverlayServiceFactory } from '../../../overlays/overlay.service.js';
import { ModelSerializationService, ModelSerializationServiceFactory } from './model-serialization.service.js';

describe('Model Serialization Service UT', () => {
  beforeEach(async () => {
    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    await Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(OverlayService, OverlayServiceFactory);

    Container.registerFactory(ModelSerializationService, ModelSerializationServiceFactory);
    const modelSerializationService = await Container.get(ModelSerializationService, { args: [true] });
    modelSerializationService.registerClass('App', App);
    modelSerializationService.registerClass('Image', Image);
    modelSerializationService.registerClass('Region', Region);
    modelSerializationService.registerClass('Service', Service);
    modelSerializationService.registerClass('Subnet', Subnet);
    modelSerializationService.registerClass('TestAnchor', TestAnchor);
    modelSerializationService.registerClass('TestOverlay', TestOverlay);
  });

  afterEach(() => {
    Container.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const service = await Container.get(ModelSerializationService);

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
      const service = await Container.get(ModelSerializationService);

      const serializedOutput: ModelSerializedOutput = {
        anchors: [],
        dependencies: [
          {
            from: 'app=name',
          } as IDependency,
        ],
        models: {
          'app=name': { className: 'Service', model: null },
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
      } = create({ app: ['test-app'], region: ['region'] });

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
      } = create({ app: ['test-app'], region: ['region'] });

      const region_1 = await commit(region);

      expect(region_1.regionId).toBe('region');
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const service = await Container.get(ModelSerializationService);

      const {
        app: [app],
      } = create({ app: ['test'], image: ['image'], region: ['region'], subnet: ['private', 'public:-1'] });

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
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      expect(overlayDataRepository['oldOverlays']).toHaveLength(0);
      const app_1 = await commit(app);
      expect(overlayDataRepository['oldOverlays']).toHaveLength(1);

      const overlay1_1 = overlayDataRepository['oldOverlays'][0];
      expect(overlay1_1.getAnchors().map((a) => a.getParent().getContext())).toEqual([
        app_1.getContext(),
        app_1.getContext(),
      ]);
    });

    it('should not share any models between old and new overlays', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      await createTestOverlays({ 'overlay-1': [anchor1] });

      expect(overlayDataRepository['oldOverlays']).toHaveLength(0);
      await commit(app);
      expect(overlayDataRepository['oldOverlays']).toHaveLength(1);

      // Modify the new app.
      app.addRegion(new Region('region-1'));

      // Ensure the new and old overlays in the OverlayDataRepository are not shared.
      expect(overlayDataRepository['oldOverlays'][0].getAnchors()[0].getParent().getChildren()['region']).toBe(
        undefined,
      );
      expect(overlayDataRepository['newOverlays'][0].getAnchors()[0].getParent().getChildren()['region']).toHaveLength(
        1,
      );
    });

    it('should not initialize OverlayDataRepository with new overlays marked for deletion', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);
      const overlayService = await Container.get(OverlayService);

      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      expect(overlayDataRepository['oldOverlays']).toHaveLength(0);
      await commit(app);
      expect(overlayDataRepository['oldOverlays']).toHaveLength(1);

      // Remove the new overlay.
      overlayService.removeOverlay(overlay1);

      expect(overlayDataRepository['oldOverlays']).toHaveLength(1);
      await commit(app);
      expect(overlayDataRepository['oldOverlays']).toHaveLength(0);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', async () => {
      const {
        app: [app],
      } = create({
        app: ['test-app'],
        environment: ['qa'],
        image: ['image'],
        region: ['region-1'],
        server: ['backend'],
      });

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should not serialize deleted models', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });
      app.remove();

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize model anchors', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize only boundary members', async () => {
      const {
        region: [region1],
      } = create({ app: ['test-app'], environment: ['qa', 'qa'], region: ['region-1', 'region-2:-1'] });

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(region1)).toMatchSnapshot();
    });

    it('should serialize overlay with multiple anchors of same parent', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize two overlay dependencies with each other', async () => {
      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1, overlay2] = await createTestOverlays({ 'overlay-1': [anchor1], 'overlay-2': [anchor2] });
      overlay1.addRelationship(overlay2);

      const service = await Container.get(ModelSerializationService);

      expect(await service.serialize(app)).toMatchSnapshot();
    });
  });
});
