import type { ValidationType } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { ValidationService } from '../services/validation/validation.service.js';

type ValidationOptions<T> = {
  options: { [key in ValidationType]?: any };
  destruct?: (value: any) => T[];
};

export function Validate<T>(
  validators: ValidationOptions<T> | ValidationOptions<T>[],
): (target: any, propertyKey: string) => void {
  const container = Container.getInstance();

  return function (target: any, propertyKey: string) {
    const promise = container.get(ValidationService).then((validationService) => {
      const symbol = Symbol();

      Object.defineProperty(target, propertyKey, {
        get: function () {
          return this[symbol];
        },
        set: function (newValue: any) {
          if (!Array.isArray(validators)) {
            validators = [validators];
          }

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

          this[symbol] = newValue;
        },
      });
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
