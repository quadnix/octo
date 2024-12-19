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
