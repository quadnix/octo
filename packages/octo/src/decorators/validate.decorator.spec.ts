import type { UnknownResource } from '../app.type.js';
import { createTestResources } from '../utilities/test-helpers/test-resources.js';
import { Validate } from './validate.decorator.js';

class ValidationTest {
  @Validate({ options: { minLength: 2 } })
  property1: string;

  @Validate([
    {
      destruct: (value: { key1: string; key2: string }[]): string[] => value.map((v) => v.key1),
      options: { minLength: 2, regex: /^[a-z]+$/ },
    },
    {
      destruct: (value: { key1: string; key2: string }[]): string[] => value.map((v) => v.key2),
      options: { minLength: 2 },
    },
  ])
  property2: { key1: string; key2: string }[];

  @Validate({ options: { isResource: { NODE_NAME: 'test-resource' } } })
  property3: UnknownResource;

  @Validate({ options: {} }, (value: any): object => {
    if (typeof value !== 'string') {
      throw new Error('Value is not string!');
    }
    return JSON.parse(value);
  })
  property4: string;
}

describe('Validate UT', () => {
  it('should validate basic property', () => {
    const validationTest = new ValidationTest();

    expect(() => {
      validationTest.property1 = 'a';
    }).toThrow('Validation error!');

    expect(() => {
      validationTest.property1 = 'ab';
    }).not.toThrow();
  });

  it('should validate an object', () => {
    const validationTest = new ValidationTest();

    expect(() => {
      validationTest.property2 = [{ key1: '1', key2: '2' }];
    }).toThrow('Validation error!');

    expect(() => {
      validationTest.property2 = [{ key1: 'ab', key2: 'cd' }];
    }).not.toThrow();
  });

  it('should validate a resource', async () => {
    const validationTest = new ValidationTest();
    const { '@octo/test-resource=resource-1': resource1, '@octo/unknown-resource=resource-2': resource2 } =
      await createTestResources([
        { resourceContext: '@octo/test-resource=resource-1' },
        { resourceContext: '@octo/unknown-resource=resource-2' },
      ]);

    expect(() => {
      validationTest.property3 = resource2;
    }).toThrow('Validation error!');

    expect(() => {
      validationTest.property3 = resource1;
    }).not.toThrow();
  });

  describe('transform', () => {
    it('should throw error when transform fails', () => {
      const validationTest = new ValidationTest();

      expect(() => {
        validationTest.property4 = 123 as any;
      }).toThrow('Value is not string!');
    });

    it('should transform property', () => {
      const validationTest = new ValidationTest();
      validationTest.property4 = JSON.stringify({ key: 'value' });

      expect(validationTest.property4).toEqual({ key: 'value' });
    });
  });
});
