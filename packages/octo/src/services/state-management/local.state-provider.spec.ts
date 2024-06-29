import { unlink } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { TestResource } from '../../../test/helpers/test-classes.js';
import { Container } from '../../decorators/container.js';
import { App } from '../../models/app/app.model.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { ModelSerializationService } from '../serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { LocalStateProvider } from './local.state-provider.js';
import { StateManagementService } from './state-management.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const unlinkAsync = promisify(unlink);

describe('LocalStateProvider UT', () => {
  describe('getModelState()', () => {
    let filePath;

    afterEach(async () => {
      if (filePath) {
        await unlinkAsync(filePath);
      }
    });

    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const { data, userData } = await stateManagementService.getModelState('models1.json');
      expect(data).toMatchInlineSnapshot(`
       {
         "anchors": [],
         "dependencies": [],
         "models": {},
         "overlays": [],
       }
      `);
      expect(userData).toMatchInlineSnapshot(`{}`);
    });

    it('should be able to retrieve a frozen state', async () => {
      filePath = join(__dirname, 'models2.json');

      const app = new App('test');
      const modelSerializationService = await Container.get(ModelSerializationService);
      const serializedOutput = await modelSerializationService.serialize(app);

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await stateManagementService.saveModelState('models2.json', serializedOutput, { version: 1 });
      const { data, userData } = await stateManagementService.getModelState('models2.json');

      expect(() => {
        data['key1'] = 'value1';
      }).toThrow();
      expect(() => {
        userData['key2'] = 'value2';
      }).toThrow();
    });
  });

  describe('getResourceState()', () => {
    let filePath;

    afterEach(async () => {
      if (filePath) {
        await unlinkAsync(filePath);
      }
    });

    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const { data, userData } = await stateManagementService.getResourceState('resources1.json');
      expect(data).toMatchInlineSnapshot(`
       {
         "dependencies": [],
         "resources": {},
         "sharedResources": {},
       }
      `);
      expect(userData).toMatchInlineSnapshot(`{}`);
    });

    it('should be able to retrieve a frozen state', async () => {
      filePath = join(__dirname, 'resources2.json');

      const resource1 = new TestResource('resource-1');
      const resourceDataRepository = await Container.get(ResourceDataRepository);
      resourceDataRepository.add(resource1);

      const resourceSerializationService = await Container.get(ResourceSerializationService);
      const serializedOutput = await resourceSerializationService.serialize();

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      await stateManagementService.saveResourceState('resources2.json', serializedOutput, { version: 1 });
      const { data, userData } = await stateManagementService.getModelState('resources2.json');

      expect(() => {
        data['key1'] = 'value1';
      }).toThrow();
      expect(() => {
        userData['key2'] = 'value2';
      }).toThrow();
    });
  });

  describe('getState()', () => {
    let filePath;

    afterEach(async () => {
      if (filePath) {
        await unlinkAsync(filePath);
      }
    });

    it('should be able to get a default state', async () => {
      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const state = await stateManagementService.getState('manifest1.json', 'default');
      expect(state).toMatchInlineSnapshot(`"default"`);
    });

    it('should be able to get the saved state', async () => {
      filePath = join(__dirname, 'manifest2.json');

      const localStateProvider = new LocalStateProvider(__dirname);
      const stateManagementService = new StateManagementService(localStateProvider);

      const data = Buffer.from(
        JSON.stringify({
          key1: 'value1',
          key2: 'value2',
        }),
      );
      await stateManagementService.saveState('manifest2.json', data);

      const manifestData = await stateManagementService.getState('manifest2.json');
      expect(JSON.parse(manifestData.toString())).toMatchInlineSnapshot(`
      {
        "key1": "value1",
        "key2": "value2",
      }
    `);
    });
  });
});
