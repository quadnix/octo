import { IDependency } from '../../../functions/dependency/dependency.model';
import { App } from '../../../models/app/app.model';
import { Deployment } from '../../../models/deployment/deployment.model';
import { Environment } from '../../../models/environment/environment.model';
import { Image } from '../../../models/image/image.model';
import { Region } from '../../../models/region/region.model';
import { Server } from '../../../models/server/server.model';
import { Support } from '../../../models/support/support.model';
import { ModelSerializationService, ModelSerializedOutput } from './model-serialization.service';

describe('Model Serialization Service UT', () => {
  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', async () => {
      const serializedOutput: ModelSerializedOutput = {
        dependencies: [
          {
            from: 'App',
          } as IDependency,
        ],
        models: {
          App: { className: 'ClassNotExist', model: null },
        } as any,
      };

      const service = new ModelSerializationService();
      await expect(async () => {
        await service.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid class, no reference to unSynth static method!"`);
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
  });

  describe('serialize()', () => {
    it('should serialize an empty app', () => {
      const app0 = new App('test-app');

      const service = new ModelSerializationService();
      expect(service.serialize(app0)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-1');
      const environment0 = new Environment('qa');
      app0.addRegion(region0);
      app0.addServer(new Server('backend'));
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
      const image0 = new Image('backend-runner', '0.0.1', { dockerFilePath: '/Dockerfile' });
      const server0 = new Server('backend');
      const deployment0 = new Deployment('0.0.1', image0);
      const deployment1 = new Deployment('0.0.2', image0);
      app0.addImage(image0);
      app0.addServer(server0);
      server0.addDeployment(deployment0);
      server0.addDeployment(deployment1);

      expect(service.serialize(app0)).toMatchSnapshot();
    });
  });
});