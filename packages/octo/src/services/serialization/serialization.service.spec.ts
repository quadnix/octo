import { IDependency } from '../../functions/dependency/dependency.model';
import { App } from '../../models/app/app.model';
import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { Server } from '../../models/server/server.model';
import { Support } from '../../models/support/support.model';
import { SerializationService } from './serialization.service';

describe('Serialization Service UT', () => {
  describe('deserialize()', () => {
    it('should throw error when de-serializing with a different version', async () => {
      const serializationService = new SerializationService();
      await expect(async () => {
        await serializationService.deserialize({ version: 'v1' } as ReturnType<SerializationService['serialize']>);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Version mismatch on deserialization!"`);
    });

    it('should throw error when de-serializing an unknown class', async () => {
      const serializedOutput: ReturnType<SerializationService['serialize']> = {
        dependencies: [
          {
            from: 'App',
          } as IDependency,
        ],
        models: {
          App: { className: 'ClassNotExist', model: null },
        } as any,
        version: 'v0',
      };

      const serializationService = new SerializationService();
      await expect(async () => {
        await serializationService.deserialize(serializedOutput);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid class, no reference to unSynth static method!"`);
    });

    it('should deserialize known classes', async () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      const serializationService = new SerializationService();
      serializationService.registerClass('App', App);

      const output = serializationService.serialize(app0);
      const newApp = (await serializationService.deserialize(output)) as App;

      expect(newApp.name).toBe('test-app');
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty app', () => {
      const app = new App('test-app');

      const serializationService = new SerializationService();
      expect(serializationService.serialize(app)).toMatchSnapshot();
    });

    it('should serialize a non-empty app', async () => {
      const app = new App('test-app');
      const region = new Region('region-1');
      const environment = new Environment('qa');
      app.addRegion(region);
      app.addServer(new Server('backend'));
      app.addSupport(new Support('nginx', 'nginx'));
      environment.environmentVariables.set('key', 'value');
      region.addEnvironment(environment);

      const serializationService = new SerializationService();
      expect(serializationService.serialize(app)).toMatchSnapshot();
    });
  });
});
