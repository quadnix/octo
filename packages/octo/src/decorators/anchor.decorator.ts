import { Container } from '../functions/container/container.js';
import { AAnchor } from '../overlays/anchor.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * An `@Anchor` is a class decorator to be placed on top of a class that represents an anchor.
 * - An anchor must extend the {@link AAnchor} class.
 *
 * @example
 * ```ts
 * @Anchor('my-package')
 * export class MyAnchor extends AAnchor { ... }
 * ```
 * @group Decorators
 * @param packageName The package name that owns this anchor (e.g. `'@my-package'`).
 *   Must match the regex `^[@A-Za-z][\w-]+[A-Za-z]$`.
 * @returns The decorated class.
 * @see Definition of [Anchors](/docs/fundamentals/overlays).
 */
export function Anchor(packageName: string): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!(constructor.prototype instanceof AAnchor)) {
      throw new Error(`Class "${constructor.name}" must extend the AAnchor class!`);
    }

    constructor.NODE_PACKAGE = packageName;

    const promise = container.get(ModelSerializationService).then((modelSerializationService) => {
      modelSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
