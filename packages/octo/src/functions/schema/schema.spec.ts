import { Validate } from '../../decorators/validate.decorator.js';
import { Schema, getSchemaInstance, getSchemaKeys } from './schema.js';

describe('Schema UT', () => {
  describe('getSchemaInstance()', () => {
    it('should throw error if schema property could not be resolved', () => {
      class TestSchema {
        regionId = Schema<string>();
        regionName = Schema<string>();
      }
      const value = { regionId: 'regionId' };
      expect(() => getSchemaInstance(TestSchema, value)).toThrow(
        'Property "regionName" in schema could not be resolved!',
      );
    });

    it('should not throw error if optional schema property could not be resolved', () => {
      class TestSchema {
        regionId = Schema<string>();
        regionName? = Schema<string | null>(null);
      }
      const value = { regionId: 'regionId' };
      const instance = getSchemaInstance(TestSchema, value);
      expect(instance).toEqual({ regionId: 'regionId', regionName: null });
    });

    it('should take default property value from schema when not provided', () => {
      class TestSchema {
        regionId = Schema<string>();
        regionName = Schema<string>('regionName');
      }
      const value = { regionId: 'regionId' };
      const instance = getSchemaInstance(TestSchema, value);
      expect(instance).toEqual({ regionId: 'regionId', regionName: 'regionName' });
    });

    it('should override default property value from schema when provided', () => {
      class TestSchema {
        regionId = Schema<string>();
        regionName = Schema<string>('regionName');
      }
      const value = { regionId: 'regionId', regionName: 'regionName1' };
      const instance = getSchemaInstance(TestSchema, value);
      expect(instance).toEqual({ regionId: 'regionId', regionName: 'regionName1' });
    });

    it('should validate complex schema', () => {
      class TestSchema {
        @Validate({ destruct: (value: { key1: string }): string[] => [value.key1], options: { minLength: 1 } })
        properties = Schema<{ key1: string }>();
      }
      const value = { properties: 'a string' };
      expect(() => getSchemaInstance(TestSchema, value)).toThrow();
    });

    it('should validate nested schema', () => {
      class NestedSchema {
        @Validate({ options: { minLength: 4 } })
        name = Schema<string>();
      }
      class TestSchema {
        @Validate({ options: { isSchema: { schema: NestedSchema } } })
        student = Schema<NestedSchema>();
      }

      const value1 = {};
      expect(() => getSchemaInstance(TestSchema, value1)).toThrow();

      const value2 = { student: { name: 'bad' } };
      expect(() => getSchemaInstance(TestSchema, value2)).toThrow('Validation error!');

      const value3 = { student: { name: 'good' } };
      const instance3 = getSchemaInstance(TestSchema, value3);
      expect(instance3).toEqual(value3);
    });
  });

  describe('getSchemaKeys()', () => {
    it('should return schema keys', () => {
      class TestSchema {
        regionId = Schema<string>();
        regionName = Schema<string>();
      }
      expect(getSchemaKeys(TestSchema)).toEqual(['regionId', 'regionName']);
    });
  });
});
