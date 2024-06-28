import { TestAnchor, TestOverlay } from '../../../../test/helpers/test-classes.js';
import { type ModelSerializedOutput } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { type IDependency } from '../../../functions/dependency/dependency.js';
import { App } from '../../../models/app/app.model.js';
import { Environment } from '../../../models/environment/environment.model.js';
import { Image } from '../../../models/image/image.model.js';
import { Region } from '../../../models/region/region.model.js';
import { Server } from '../../../models/server/server.model.js';
import { Service } from '../../../models/service/service.model.js';
import { Subnet } from '../../../models/subnet/subnet.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../../overlays/overlay-data.repository.js';
import { OverlayService, OverlayServiceFactory } from '../../../overlays/overlay.service.js';
import { ModelSerializationService, ModelSerializationServiceFactory } from './model-serialization.service.js';

describe('Model Serialization Service UT', () => {
  beforeEach(() => {
    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(OverlayService, OverlayServiceFactory);

    Container.registerFactory(ModelSerializationService, ModelSerializationServiceFactory);
    Container.get(ModelSerializationService, { args: [true] });
  });

  afterEach(() => {
    Container.reset();
  });

  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
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

      const service = await Container.get(ModelSerializationService);
      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrow();
    });

    it('should throw error when de-serializing a class with default unSynth', async () => {
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

      const service = await Container.get(ModelSerializationService);
      service.registerClass('Service', Service);

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Method not implemented! Use derived class implementation"`);
    });

    it('should be able to register classes and deserialize', async () => {
      const app = new App('test-app');
      const region = new Region('region-0');
      app.addRegion(region);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Region', Region);

      const output = await service.serialize(app);
      const app_1 = (await service.deserialize(output)) as App;

      expect(app_1.name).toBe('test-app');
    });

    it('should deserialize a single model', async () => {
      const app = new App('test-app');

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);

      const output = await service.serialize(app);
      const app_1 = (await service.deserialize(output)) as App;

      expect(app_1.name).toBe('test-app');
    });

    it('should return the serialized root on deserialization', async () => {
      const app = new App('test-app');
      const region = new Region('region-0');
      app.addRegion(region);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Region', Region);

      const output = await service.serialize(region);
      const region_1 = (await service.deserialize(output)) as Region;

      expect(region_1.regionId).toBe('region-0');
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const app = new App('test');
      const image = new Image('test', '0.0.1', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image);
      const region = new Region('region');
      app.addRegion(region);
      const privateSubnet = new Subnet(region, 'private');
      region.addSubnet(privateSubnet);
      const publicSubnet = new Subnet(region, 'public');
      region.addSubnet(publicSubnet);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Image', Image);
      service.registerClass('Region', Region);
      service.registerClass('Subnet', Subnet);

      const appSerialized = await service.serialize(app);
      const app_1 = (await service.deserialize(appSerialized)) as App;

      const previousDependencies = (await service.serialize(app_1)).dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      const currentDependencies = appSerialized.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      expect(previousDependencies).toEqual(currentDependencies);
    });

    it('should deserialize overlay with multiple anchors of same parent', async () => {
      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('TestAnchor', TestAnchor);
      service.registerClass('TestOverlay', TestOverlay);

      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      overlayService.addOverlay(overlay1);

      const appSerialized = await service.serialize(app);
      const app_1 = (await service.deserialize(appSerialized)) as App;

      const overlayDataRepository = await Container.get(OverlayDataRepository);
      const overlay1_1 = overlayDataRepository['oldOverlays'][0];
      expect(overlay1_1.getAnchors().map((a) => a.getParent().getContext())).toEqual([
        app_1.getContext(),
        app_1.getContext(),
      ]);
    });

    it('should not share any models between old and new overlays', async () => {
      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('TestAnchor', TestAnchor);
      service.registerClass('TestOverlay', TestOverlay);

      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      // Serialize and deserialize the app. This should setup old and new overlays in the OverlayDataRepository.
      const appSerialized = await service.serialize(app);
      await service.deserialize(appSerialized);

      // Modify the new app.
      app.addRegion(new Region('region-1'));

      // Ensure the new and old overlays in the OverlayDataRepository are not shared.
      const overlayDataRepository = await Container.get(OverlayDataRepository);
      expect(overlayDataRepository['oldOverlays'][0].getAnchors()[0].getParent().getChildren()['region']).toBe(
        undefined,
      );
      expect(overlayDataRepository['newOverlays'][0].getAnchors()[0].getParent().getChildren()['region'].length).toBe(
        1,
      );
    });

    it('should not initialize OverlayDataRepository with new overlays marked for deletion', async () => {
      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('TestAnchor', TestAnchor);
      service.registerClass('TestOverlay', TestOverlay);

      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      // Serialize and deserialize the app. This should setup old and new overlays in the OverlayDataRepository.
      const appSerialized1 = await service.serialize(app);
      await service.deserialize(appSerialized1);

      const overlayDataRepository = await Container.get(OverlayDataRepository);
      expect(overlayDataRepository.getById('overlay-1')).not.toBeUndefined();

      // Remove the new overlay.
      overlayService.removeOverlay(overlay1);

      // Ensure the deleted overlays are not initialized in the OverlayDataRepository.
      expect(overlayDataRepository.getById('overlay-1')).toBeUndefined();

      // Serialize and deserialize the app again. This should set the old overlays to the new state.
      const appSerialized2 = await service.serialize(app);
      await service.deserialize(appSerialized2);

      // Ensure the deleted overlays are not initialized in the OverlayDataRepository.
      expect(overlayDataRepository['oldOverlays'].length).toBe(0);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', async () => {
      const app = new App('test-app');

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', async () => {
      const app = new App('test-app');
      const image = new Image('image', '0.0.1', {
        dockerfilePath: '/Dockerfile',
      });
      app.addImage(image);
      const region = new Region('region-1');
      app.addRegion(region);
      const environment = new Environment('qa');
      environment.environmentVariables.set('key', 'value');
      region.addEnvironment(environment);
      app.addServer(new Server('backend'));

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should not serialize deleted models', async () => {
      const app = new App('test-app');
      app.remove();

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize model anchors', async () => {
      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize only boundary members', async () => {
      const app = new App('test-app');
      const region1 = new Region('region-1');
      app.addRegion(region1);
      const environment1 = new Environment('qa');
      region1.addEnvironment(environment1);
      const region2 = new Region('region-2');
      app.addRegion(region2);
      const environment2 = new Environment('qa');
      region2.addEnvironment(environment2);

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(region1)).toMatchSnapshot();
    });

    it('should serialize overlay with multiple anchors of same parent', async () => {
      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      overlayService.addOverlay(overlay1);

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });

    it('should serialize two overlay dependencies with each other', async () => {
      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);
      const overlay2 = new TestOverlay('overlay-2', {}, [anchor2]);
      overlayService.addOverlay(overlay2);

      overlay1.addRelationship(overlay2);

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app)).toMatchSnapshot();
    });
  });
});
