import { IDependency } from '../../../functions/dependency/dependency.model.js';
import { App } from '../../../models/app/app.model.js';
import { Deployment } from '../../../models/deployment/deployment.model.js';
import { Environment } from '../../../models/environment/environment.model.js';
import { Image } from '../../../models/image/image.model.js';
import { Region } from '../../../models/region/region.model.js';
import { Server } from '../../../models/server/server.model.js';
import { Service } from '../../../models/service/service.model.js';
import { Support } from '../../../models/support/support.model.js';
import { ModelSerializationService, ModelSerializedOutput } from './model-serialization.service.js';

describe('Model Serialization Service UT', () => {
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
        modules: [],
      };

      const service = new ModelSerializationService();
      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrowError();
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
        modules: [],
      };

      const service = new ModelSerializationService();
      service.registerClass('Service', Service);

      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Method not implemented! Use derived class implementation"`);
    });

    it('should deserialize unknown classes when registered', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = new ModelSerializationService();
      service.registerClass('App', App);

      const output = service.serialize(app0);
      const app1 = (await service.deserialize(output)) as App;

      expect(app1.name).toBe('test-app');
    });

    it('should deserialize known classes', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = new ModelSerializationService();

      const output = service.serialize(app0);
      const app1 = (await service.deserialize(output)) as App;

      expect(app1.name).toBe('test-app');
    });

    it('should return the serialized root on deserialization', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const service = new ModelSerializationService();

      const output = service.serialize(region0);
      const region1 = (await service.deserialize(output)) as Region;

      expect(region1.regionId).toBe('region-0');
    });

    it('should have exact same dependencies on deserialized object as original object', async () => {
      const app = new App('test');
      const image = new Image('test', '0.0.1', {
        dockerFilePath: 'path/to/Dockerfile',
      });
      app.addImage(image);
      const support = new Support('support-1', 'nginx');
      app.addSupport(support);
      const deployment = new Deployment('support-1@0.0.1', image);
      support.addDeployment(deployment);

      const service = new ModelSerializationService();
      const appSerialized = service.serialize(app);
      const appDeserialized = (await service.deserialize(appSerialized)) as App;

      const newAppDependencies = service
        .serialize(appDeserialized)
        .dependencies.sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      const oldAppDependencies = appSerialized.dependencies.sort((a, b) =>
        a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0,
      );
      expect(newAppDependencies).toEqual(oldAppDependencies);
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', () => {
      const app0 = new App('test-app');

      const service = new ModelSerializationService();
      expect(service.serialize(app0)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', () => {
      const app0 = new App('test-app');
      const image0 = new Image('image', '0.0.1', {
        dockerFilePath: '/Dockerfile',
      });
      const region0 = new Region('region-1');
      const environment0 = new Environment('qa');
      app0.addImage(image0);
      app0.addRegion(region0);
      app0.addServer(new Server('backend', image0));
      app0.addSupport(new Support('nginx', 'nginx'));
      environment0.environmentVariables.set('key', 'value');
      region0.addEnvironment(environment0);

      const service = new ModelSerializationService();
      expect(service.serialize(app0)).toMatchSnapshot();
    });

    it('should serialize only boundary members', () => {
      const app0 = new App('test-app');
      const region0_1 = new Region('region-1');
      const region0_2 = new Region('region-2');
      const environment0_1 = new Environment('qa');
      const environment0_2 = new Environment('qa');
      app0.addRegion(region0_1);
      app0.addRegion(region0_2);
      region0_1.addEnvironment(environment0_1);
      region0_2.addEnvironment(environment0_2);

      const service = new ModelSerializationService();
      expect(service.serialize(region0_1)).toMatchSnapshot();
    });

    it('should serialize when multiple models have dependency on same model', async () => {
      const service = new ModelSerializationService();

      const app0 = new App('test-app');
      const image0 = new Image('image', '0.0.1', { dockerFilePath: '/Dockerfile' });
      const server0 = new Server('backend', image0);
      const deployment0 = new Deployment('backend@0.0.1', image0);
      const deployment1 = new Deployment('backend@0.0.2', image0);
      app0.addImage(image0);
      app0.addServer(server0);
      server0.addDeployment(deployment0);
      server0.addDeployment(deployment1);

      expect(service.serialize(app0)).toMatchSnapshot();
    });
  });
});
