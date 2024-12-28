import { jest } from '@jest/globals';
import { Validate } from '../decorators/validate.decorator.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { Schema } from '../functions/schema/schema.js';
import { AResource } from '../resources/resource.abstract.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService } from '../services/input/input.service.js';
import { SchemaTranslationService } from '../services/schema-translation/schema-translation.service.js';
import { create, createTestResources } from '../utilities/test-helpers/test-models.js';

class FromSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.fromKey], options: { minLength: 1 } })
  override properties = Schema<{ fromKey: string }>();
}
class ToSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.toKey], options: { minLength: 1 } })
  override properties = Schema<{ toKey: string }>();
}

describe('Model UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          { type: InputService, value: { getModuleIdFromModel: jest.fn(), getModuleResources: jest.fn() } },
          { type: SchemaTranslationService, value: new SchemaTranslationService() },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('getResourceMatchingSchema()', () => {
    it('should return undefined if no resource found', async () => {
      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resource = await app.getResourceMatchingSchema(FromSchema);

      expect(resource).toBeUndefined();
    });

    it('should return undefined if no matching resource found', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resource = await app.getResourceMatchingSchema(FromSchema);

      expect(resource).toBeUndefined();
    });

    it('should return matching resource without translation', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['fromKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resource = await app.getResourceMatchingSchema(FromSchema);

      expect(resource).not.toBeUndefined();
      expect(resource![0].properties).toEqual({ fromKey: 'value1' });
    });

    it('should return first matching resource without translation', async () => {
      const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
      resource1.properties['toKey'] = 'value0';
      resource2.properties['fromKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1, resource2]);

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resource = await app.getResourceMatchingSchema(FromSchema);

      expect(resource).not.toBeUndefined();
      expect(resource![0].properties).toEqual({ fromKey: 'value1' });
    });

    it('should return matching resource with translation', async () => {
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['toKey'] = 'value1';

      const inputService = await container.get(InputService);
      jest.spyOn(inputService, 'getModuleIdFromModel').mockReturnValue('testModule');
      jest.spyOn(inputService, 'getModuleResources').mockReturnValue([resource1]);

      // Register translation.
      const schemaTranslationService = await container.get(SchemaTranslationService);
      schemaTranslationService.registerResourceSchemaTranslation(FromSchema, ToSchema, (resource) => {
        resource.properties['fromKey'] = resource.properties.toKey;
        return resource as unknown as AResource<FromSchema, any>;
      });

      const {
        app: [app],
      } = create({ app: ['app'] });
      const resource = await app.getResourceMatchingSchema(FromSchema);

      expect(resource).not.toBeUndefined();
      expect(resource![0].properties).toEqual({ fromKey: 'value1', toKey: 'value1' });
    });
  });
});
