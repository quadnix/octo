import { ValidationType } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { ValidationService } from './validation.service.js';

class ValidationTest {
  property1: string;

  property2: { key1: string; key2: string }[];
}

describe('ValidationService UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  it('should validate instance properties', async () => {
    const validationService = await container.get(ValidationService);

    const validationTest = new ValidationTest();
    validationTest.property1 = 'a';
    validationTest.property2 = [
      { key1: '1', key2: '2' },
      { key1: '3', key2: '4' },
    ];

    // Validate `property1` has MIN_LENGTH of 2.
    validationService.addSubject(ValidationType.MIN_LENGTH, 2, ValidationTest, 'property1', validationTest.property1);
    // Validate `property2.key1` has MIN_LENGTH of 2.
    validationService.addSubject(
      ValidationType.MIN_LENGTH,
      2,
      ValidationTest,
      'property2',
      validationTest.property2,
      (value: { key1: string; key2: string }[]): string[] => value.map((v) => v.key1),
    );
    // Validate `property2.key2` has MIN_LENGTH of 2.
    validationService.addSubject(
      ValidationType.MIN_LENGTH,
      2,
      ValidationTest,
      'property2',
      validationTest.property2,
      (value: { key1: string; key2: string }[]): string[] => value.map((v) => v.key2),
    );
    // Validate `property2.key1` has valid REGEX.
    validationService.addSubject(
      ValidationType.REGEX,
      /^[a-z]+$/,
      ValidationTest,
      'property2',
      validationTest.property2,
      (value: { key1: string; key2: string }[]): string[] => value.map((v) => v.key1),
    );

    const result1 = validationService.validate();
    expect(result1.pass).toBeFalsy();
    expect(result1.errors).toMatchInlineSnapshot(`
     [
       {
         "constraint": 2,
         "type": "minLength",
         "value": "a",
       },
       {
         "constraint": 2,
         "type": "minLength",
         "value": "1",
       },
       {
         "constraint": 2,
         "type": "minLength",
         "value": "3",
       },
       {
         "constraint": 2,
         "type": "minLength",
         "value": "2",
       },
       {
         "constraint": 2,
         "type": "minLength",
         "value": "4",
       },
       {
         "constraint": /\\^\\[a-z\\]\\+\\$/,
         "type": "regex",
         "value": "1",
       },
       {
         "constraint": /\\^\\[a-z\\]\\+\\$/,
         "type": "regex",
         "value": "3",
       },
     ]
    `);

    validationService.removeSubject<ValidationTest>(ValidationTest, 'property1');
    validationService.removeSubject<ValidationTest>(ValidationTest, 'property2');

    const result2 = validationService.validate();
    expect(result2.pass).toBeTruthy();
    expect(result2.errors).toMatchInlineSnapshot(`[]`);
  });

  it('should validate instance custom properties', async () => {
    const validationService = await container.get(ValidationService);

    validationService.addSubject(ValidationType.MIN_LENGTH, 2, ValidationTest, 'unknown', 'a');
    const result1 = validationService.validate();
    expect(result1.pass).toBeFalsy();
    expect(result1.errors).toMatchInlineSnapshot(`
     [
       {
         "constraint": 2,
         "type": "minLength",
         "value": "a",
       },
     ]
    `);

    validationService.removeSubject<ValidationTest>(ValidationTest, 'unknown');
    const result2 = validationService.validate();
    expect(result2.pass).toBeTruthy();
    expect(result2.errors).toMatchInlineSnapshot(`[]`);
  });
});
