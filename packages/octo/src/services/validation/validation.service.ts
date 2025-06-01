import { type Constructable, ValidationType } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { ValidationUtility } from '../../utilities/validation/validation.utility.js';

export class ValidationService {
  private readonly subjects: {
    constraint: any;
    destruct?: (value: any) => any[];
    propertyKey: string;
    target: any;
    type: ValidationType;
    value: any;
  }[] = [];

  addSubject<T>(
    type: ValidationType,
    constraint: any,
    target: Constructable<T>,
    propertyKey: string,
    value: any,
    destruct?: (value: any) => any[],
  ): void {
    this.subjects.push({ constraint, destruct, propertyKey, target, type, value });
  }

  removeSubject<T>(target: Constructable<T>, propertyKey: string): void {
    for (let i = this.subjects.length - 1; i >= 0; i--) {
      if (
        (this.subjects[i].target === target || this.subjects[i].target === target.prototype) &&
        this.subjects[i].propertyKey === propertyKey
      ) {
        this.subjects.splice(i, 1);
      }
    }
  }

  validate(): { pass: boolean; errors: { constraint: any; type: ValidationType; value: any }[] } {
    const result: ReturnType<typeof this.validate> = { errors: [], pass: true };

    for (const subject of this.subjects) {
      let values: any[] = subject.destruct ? subject.destruct(subject.value) : [subject.value];
      if (!values) {
        values = [undefined];
      }

      for (const value of values) {
        let pass: boolean = true;

        switch (subject.type) {
          case ValidationType.CUSTOM:
            pass = ValidationUtility.validateCustom(value, subject.constraint);
            break;
          case ValidationType.IS_MODEL:
            pass = ValidationUtility.validateIsModel(value, subject.constraint);
            break;
          case ValidationType.IS_OVERLAY:
            pass = ValidationUtility.validateIsOverlay(value, subject.constraint);
            break;
          case ValidationType.IS_RESOURCE:
            pass = ValidationUtility.validateIsResource(value, subject.constraint);
            break;
          case ValidationType.IS_SCHEMA:
            pass = ValidationUtility.validateIsSchema(value, subject.constraint);
            break;
          case ValidationType.MAX_LENGTH:
            pass = ValidationUtility.validateMaxLength(value, subject.constraint);
            break;
          case ValidationType.MIN_LENGTH:
            pass = ValidationUtility.validateMinLength(value, subject.constraint);
            break;
          case ValidationType.REGEX:
            pass = ValidationUtility.validateRegex(value, subject.constraint);
            break;
        }

        if (!pass) {
          result.errors.push({ constraint: subject.constraint, type: subject.type, value });
        }
      }
    }

    result.pass = result.errors.length === 0;
    return result;
  }
}

@Factory<ValidationService>(ValidationService)
export class ValidationServiceFactory {
  private static instance: ValidationService;

  static async create(): Promise<ValidationService> {
    if (!this.instance) {
      this.instance = new ValidationService();
    }

    return this.instance;
  }
}
