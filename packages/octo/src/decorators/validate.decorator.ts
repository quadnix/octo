import type { ValidationType, ValidationTypeOptions } from '../app.type.js';
import { ValidationTransactionError } from '../errors/index.js';
import { ValidationService } from '../services/validation/validation.service.js';

type ValidationOptions<T> = {
  destruct?: (value: any) => T[];
  options: { [key in ValidationType]?: ValidationTypeOptions[key] };
};

export function Validate<T>(
  validators: ValidationOptions<T> | ValidationOptions<T>[],
  transform?: (value: any) => any,
): (target: any, propertyKey: string) => void {
  return function (target: any, propertyKey: string) {
    const symbol = Symbol();

    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      get: function () {
        return this[symbol];
      },
      set: function (newValue: any) {
        if (newValue === undefined) {
          this[symbol] = undefined;
          return;
        }

        if (transform) {
          newValue = transform(newValue);
        }

        if (!Array.isArray(validators)) {
          validators = [validators];
        }

        const validationService = new ValidationService();
        for (const validator of validators) {
          for (const [type, constraint] of Object.entries(validator.options)) {
            validationService.addSubject(
              type as ValidationType,
              constraint,
              target,
              propertyKey,
              newValue,
              validator.destruct,
            );
          }
        }

        const result = validationService.validate();
        if (!result.pass) {
          throw new ValidationTransactionError('Validation error!', result);
        }

        this[symbol] = newValue;
      },
    });
  };
}
