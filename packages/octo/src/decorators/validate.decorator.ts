import type { ValidationType, ValidationTypeOptions } from '../app.type.js';
import { ValidationTransactionError } from '../errors/index.js';
import { ValidationService } from '../services/validation/validation.service.js';

type ValidationOptions<T> = {
  destruct?: (value: any) => T[];
  options: { [key in ValidationType]?: ValidationTypeOptions[key] };
};

/**
 * A `@Validate` is a property decorator to validate a property.
 * It is typically used in {@link Schema} to validate schema properties.
 *
 * Validation runs on assignment, and a failure throws a {@link ValidationTransactionError}.
 * Declaring constraints here is what lets a module reject bad inputs before any infrastructure is touched.
 *
 * @example
 * ```ts
 * @Validate({ options: { maxLength: 65535, minLength: 1 } })
 * containerPort = Schema<number>();
 * ```
 *
 * @group Decorators
 *
 * @param validators One constraint, or an array of them. Each constraint carries the `options` to apply,
 * and an optional `destruct` to reduce the property into the list of values the constraints run against.
 * Without `destruct`, the property value is validated as-is.
 * @param transform Runs before validation, and **replaces** the stored value with what it returns.
 *
 * @see Techniques for [Validation](/docs/techniques/validation) for the full list of constraints.
 */
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
