import { ModelSerializedOutput } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { IDependency } from '../../../functions/dependency/dependency.js';
import { App } from '../../../models/app/app.model.js';
import { Environment } from '../../../models/environment/environment.model.js';
import { Image } from '../../../models/image/image.model.js';
import { Region } from '../../../models/region/region.model.js';
import { Server } from '../../../models/server/server.model.js';
import { Service } from '../../../models/service/service.model.js';
import { Subnet } from '../../../models/subnet/subnet.model.js';
import { Support } from '../../../models/support/support.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../../overlays/overlay-data.repository.js';
import { ModelSerializationService, ModelSerializationServiceFactory } from './model-serialization.service.js';

describe('Model Serialization Service UT', () => {
  beforeEach(() => {
    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    Container.get(OverlayDataRepository, { args: [true, [], []] });

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

    it('should deserialize unknown classes when registered', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Region', Region);

      const output = await service.serialize(app0);
      const app1 = (await service.deserialize(output)) as App;

      expect(app1.name).toBe('test-app');
    });

    it('should deserialize known classes', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Region', Region);

      const output = await service.serialize(app0);
      const app1 = (await service.deserialize(output)) as App;

      expect(app1.name).toBe('test-app');
    });

    it('should return the serialized root on deserialization', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = await Container.get(ModelSerializationService);
      service.registerClass('App', App);
      service.registerClass('Region', Region);

      const output = await service.serialize(region0);
      const region1 = (await service.deserialize(output)) as Region;

      expect(region1.regionId).toBe('region-0');
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
      const appDeserialized = (await service.deserialize(appSerialized)) as App;

      const newAppDependencies = (await service.serialize(appDeserialized)).dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      const oldAppDependencies = appSerialized.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      expect(newAppDependencies).toEqual(oldAppDependencies);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', async () => {
      const app0 = new App('test-app');

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app0)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', async () => {
      const app0 = new App('test-app');
      const image0 = new Image('image', '0.0.1', {
        dockerfilePath: '/Dockerfile',
      });
      app0.addImage(image0);
      const region0 = new Region('region-1');
      app0.addRegion(region0);
      const environment0 = new Environment('qa');
      environment0.environmentVariables.set('key', 'value');
      region0.addEnvironment(environment0);
      app0.addServer(new Server('backend'));
      app0.addSupport(new Support('nginx', 'nginx'));

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(app0)).toMatchSnapshot();
    });

    it('should serialize only boundary members', async () => {
      const app0 = new App('test-app');
      const region0_1 = new Region('region-1');
      app0.addRegion(region0_1);
      const region0_2 = new Region('region-2');
      app0.addRegion(region0_2);
      const environment0_1 = new Environment('qa');
      region0_1.addEnvironment(environment0_1);
      const environment0_2 = new Environment('qa');
      region0_2.addEnvironment(environment0_2);

      const service = await Container.get(ModelSerializationService);
      expect(await service.serialize(region0_1)).toMatchSnapshot();
    });

    it('should serialize when multiple models have dependency on same model', async () => {
      const service = await Container.get(ModelSerializationService);

      const app = new App('test-app');
      const region = new Region('region');
      app.addRegion(region);
      const privateSubnet = new Subnet(region, 'private');
      region.addSubnet(privateSubnet);
      const publicSubnet = new Subnet(region, 'public');
      region.addSubnet(publicSubnet);

      expect(await service.serialize(app)).toMatchSnapshot();
    });
  });
});
