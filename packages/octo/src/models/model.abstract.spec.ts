import { jest } from '@jest/globals';
import { Validate } from '../decorators/validate.decorator.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { Schema } from '../functions/schema/schema.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService } from '../services/input/input.service.js';
import { SchemaTranslationService } from '../services/schema-translation/schema-translation.service.js';
import { create } from '../utilities/test-helpers/test-models.js';
import { createAnchor, createTestOverlays } from '../utilities/test-helpers/test-overlays.js';
import { createTestResources } from '../utilities/test-helpers/test-resources.js';
import { Account } from './account/account.model.js';
import { AccountType } from './account/account.schema.js';
import { App } from './app/app.model.js';
import { Region } from './region/region.model.js';

const TestAnchor = createAnchor().setClassName('TestAnchor');

describe('Model UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            type: InputService,
            value: {
              getModuleIdFromModel: jest.fn(),
              getModuleIdFromOverlay: jest.fn(),
              getModuleIdFromResource: jest.fn(),
              getModuleResources: jest.fn(),
              registerOverlay: jest.fn(),
              registerResource: jest.fn(),
            },
          },
          { type: SchemaTranslationService, value: new SchemaTranslationService() },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('deriveDependencyField()', () => {
    it('should derive the field of an app that has no children', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });

      expect(app.deriveDependencyField()).toBe('name');
    });

    it('should derive the field of an app that only has sibling edges', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      await createTestOverlays([{ anchors: [anchor1], context: '@octo/test-overlay=overlay-1' }]);

      expect(app.deriveDependencyField()).toBe('name');
    });

    it('should derive the field of an app that has children', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test'] });

      expect(app.deriveDependencyField()).toBe('name');
    });

    it('should derive the field of a model from the edge to its parent', async () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'] });

      expect(region.deriveDependencyField()).toBe('regionId');
    });

    it('should derive its own field when its first edge is to a child', async () => {
      const app = new App('test');
      const account = new Account(AccountType.AWS, 'account');
      account.addChild('accountId', new Region('region'), 'regionId');
      app.addChild('name', account, 'accountId');

      expect(account.deriveDependencyField()).toBe('accountId');
    });

    it('should skip a sibling edge that comes first', async () => {
      const {
        account: [account],
        region: [otherRegion],
      } = create({ account: ['aws,account'], app: ['test'], region: ['other-region'] });
      const region = new Region('region');
      region.addRelationship(otherRegion);
      account.addRegion(region);

      expect(region.deriveDependencyField()).toBe('regionId');
    });

    it('should derive the field of a service with several parents', async () => {
      const {
        region: [region1, region2],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region-1', 'region-2:-1'] });
      const {
        service: [service],
      } = create({ service: [['service', {}, [region1, region2]]] });

      expect(service.deriveDependencyField()).toBe('serviceId');
    });

    it('should derive the field of an overlay', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(overlay.deriveDependencyField()).toBe('overlayId');
    });
  });

  describe('getModelsMatchingSchema()', () => {
    class FromSchema {
      @Validate({ options: { minLength: 1 } })
      appName = Schema<string>();
    }
    class ToSchema {
      @Validate({ options: { minLength: 1 } })
      name = Schema<string>();
    }

    it('should return empty array if no matching models found', async () => {
      const {
        app: [app],
      } = create({ app: ['app'] });
      const models = await app.getModelsMatchingSchema(FromSchema);

      expect(models.length).toBe(0);
    });

    it('should return matching models without translation', async () => {
      const {
        app: [app],
      } = create({ app: ['app'] });
      const models = await app.getModelsMatchingSchema(ToSchema);

      expect(models.length).toBe(1);
      expect(models![0].getSchemaInstance().name).toEqual('app');
    });

    it('should return all matching models without translation', async () => {
      const {
        account: [account],
        app: [, app2],
      } = create({ account: ['aws,account'], app: ['app1', 'app2'] });
      account.addRelationship(app2);
      const models = await account.getModelsMatchingSchema(ToSchema);

      expect(models.length).toBe(2);
      expect(models![0].getSchemaInstance().name).toEqual('app1');
      expect(models![1].getSchemaInstance().name).toEqual('app2');
    });

    it('should return matching models with translation', async () => {
      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (model) => {
        model['appName'] = model.name;
        return model as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const models = await app.getModelsMatchingSchema(FromSchema);

      expect(models.length).toBe(1);
      expect(models![0].getSchemaInstance().appName).toEqual('app');
    });

    it('should return empty array with translation and non-matching filters', async () => {
      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (model) => {
        model['appName'] = model.name;
        return model as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const models = await app.getModelsMatchingSchema(FromSchema, [{ key: 'appName', value: 'non-existent' }]);

      expect(models.length).toBe(0);
    });

    it('should return matching models with translation and filters', async () => {
      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (model) => {
        model['appName'] = model.name;
        return model as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const models = await app.getModelsMatchingSchema(FromSchema, [{ key: 'appName', value: 'app' }]);

      expect(models.length).toBe(1);
      expect(models![0].getSchemaInstance().appName).toEqual('app');
    });
  });

  describe('getResourcesMatchingSchema()', () => {
    class FromSchema extends BaseResourceSchema {
      @Validate({ destruct: (value): string[] => [value.fromKey], options: { minLength: 1 } })
      override properties = Schema<{ fromKey: string }>();
    }
    class ToSchema extends BaseResourceSchema {
      @Validate({ destruct: (value): string[] => [value.toKey], options: { minLength: 1 } })
      override properties = Schema<{ toKey: string }>();
    }

    it('should return empty array if no resources found', async () => {
      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema);

      expect(resources.length).toBe(0);
    });

    it('should return empty array if no matching resources found', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema);

      expect(resources.length).toBe(0);
    });

    it('should return matching resources without translation', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['fromKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema);

      expect(resources.length).toBe(1);
      expect(resources![0].getSchemaInstance().properties).toEqual({ fromKey: 'value1' });
    });

    it('should return all matching resources without translation', async () => {
      const { '@octo/test-resource=resource-1': resource1, '@octo/test-resource=resource-2': resource2 } =
        await createTestResources([
          { resourceContext: '@octo/test-resource=resource-1' },
          { resourceContext: '@octo/test-resource=resource-2' },
        ]);
      resource1.properties['toKey'] = 'value0';
      resource2.properties['fromKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1, resource2]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema);

      expect(resources.length).toBe(1);
      expect(resources![0].getSchemaInstance().properties).toEqual({ fromKey: 'value1' });
    });

    it('should return matching resources with translation', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (resource) => {
        resource.properties['fromKey'] = resource.properties.toKey;
        return resource as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema);

      expect(resources.length).toBe(1);
      expect(resources![0].getSchemaInstance().properties).toEqual({ fromKey: 'value1', toKey: 'value1' });
    });

    it('should return empty array with translation and non-matching filters', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (resource) => {
        resource.properties['fromKey'] = resource.properties.toKey;
        return resource as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema, [{ key: 'fromKey', value: 'non-existent' }]);

      expect(resources.length).toBe(0);
    });

    it('should return matching resources with translation and filters', async () => {
      const { '@octo/test-resource=resource-1': resource1 } = await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
      ]);
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerSchemaTranslation(FromSchema, ToSchema, (resource) => {
        resource.properties['fromKey'] = resource.properties.toKey;
        return resource as unknown as FromSchema;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resources = await app.getResourcesMatchingSchema(FromSchema, [{ key: 'fromKey', value: 'value1' }]);

      expect(resources.length).toBe(1);
      expect(resources![0].getSchemaInstance().properties).toEqual({ fromKey: 'value1', toKey: 'value1' });
    });
  });
});
