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
      const value = { properties: 'a string' as any };
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
      expect(() => getSchemaInstance(TestSchema, value2)).toThrow(
        'Property "student" in schema could not be validated!',
      );

      const value3 = { student: { name: 'good' } };
      const instance3 = getSchemaInstance(TestSchema, value3);
      expect(instance3).toEqual(value3);
    });

    it('should validate optional nested schema', () => {
      class NestedSchema {
        @Validate({ destruct: (value?: string): string[] => (value ? [value] : []), options: { minLength: 4 } })
        name? = Schema<string>();
      }
      class TestSchema {
        @Validate({
          destruct: (value: NestedSchema): NestedSchema[] => (Object.keys(value).length > 0 ? [value] : []),
          options: { isSchema: { schema: NestedSchema } },
        })
        student? = Schema<NestedSchema>({});
      }

      const value1 = {};
      const instance1 = getSchemaInstance(TestSchema, value1);
      expect(instance1).toEqual({ student: {} });

      const value2 = { student: { name: 'bad' } };
      expect(() => getSchemaInstance(TestSchema, value2)).toThrow(
        'Property "student" in schema could not be validated!',
      );

      const value3 = { student: { name: 'good' } };
      const instance3 = getSchemaInstance(TestSchema, value3);
      expect(instance3).toEqual(value3);
    });

    it('should validate optional property', () => {
      class TestSchema {
        @Validate({
          destruct: (value: { key1?: string }): string[] => {
            const values: string[] = [];
            if (value.key1 !== undefined) {
              values.push(value.key1);
            }
            return values;
          },
          options: { minLength: 1 },
        })
        properties? = Schema<{ key1?: string }>({});
      }

      const value1 = {};
      const instance1 = getSchemaInstance(TestSchema, value1);
      expect(instance1).toEqual({ properties: {} });

      const value2 = { properties: {} };
      const instance2 = getSchemaInstance(TestSchema, value2);
      expect(instance2).toEqual({ properties: {} });

      const value3 = { properties: { key1: '' } };
      expect(() => getSchemaInstance(TestSchema, value3)).toThrow(
        'Property "properties" in schema could not be validated!',
      );

      const value4 = { properties: { key1: undefined } };
      const instance4 = getSchemaInstance(TestSchema, value4);
      expect(instance4).toEqual({ properties: {} });

      const value5 = { properties: { key1: null } };
      expect(() => getSchemaInstance(TestSchema, value5 as any)).toThrow(
        'Property "properties" in schema could not be validated!',
      );

      const value6 = { properties: { key1: 'value1' } };
      const instance6 = getSchemaInstance(TestSchema, value6);
      expect(instance6).toEqual(value6);
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
