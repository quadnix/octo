import { ValidationType } from '../../app.type.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { ValidationService } from './validation.service.js';

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

describe('ValidationService UT', () => {
  it('should validate instance properties', () => {
    const validationService = ValidationService.getInstance();
    const validationTest = new ValidationTest();

    validationTest.property1 = 'a';
    validationTest.property2 = [
      { key1: '1', key2: '2' },
      { key1: '3', key2: '4' },
    ];

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
         "constraint": /\\^\\[a-z\\]\\+\\$/,
         "type": "regex",
         "value": "1",
       },
       {
         "constraint": /\\^\\[a-z\\]\\+\\$/,
         "type": "regex",
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
     ]
    `);

    validationService.removeSubject<ValidationTest>(ValidationTest, 'property1');
    validationService.removeSubject<ValidationTest>(ValidationTest, 'property2');

    const result2 = validationService.validate();
    expect(result2.pass).toBeTruthy();
    expect(result2.errors).toMatchInlineSnapshot(`[]`);
  });

  it('should validate instance custom properties', () => {
    const validationService = ValidationService.getInstance();

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
