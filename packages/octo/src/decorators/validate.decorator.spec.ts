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
});
