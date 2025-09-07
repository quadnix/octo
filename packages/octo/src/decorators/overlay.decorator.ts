import { type Constructable, NodeType, type OverlaySchema, type UnknownOverlay } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * An `@Overlay` is a class decorator and must be placed on top of a class representing an overlay.
 * - An overlay must also extend the {@link AOverlay} class.
 * - For type safety, the type of overlay being decorated is passed to the decorator.
 *
 * @example
 * ```ts
 * @Overlay<MyOverlay>('@example', 'my-name', MyOverlaySchema)
 * export class MyOverlay extends AOverlay<MyOverlaySchema, MyOverlay> { ... }
 * ```
 * @group Decorators
 *
 * @param packageName - The name of the package under which the overlay is registered.
 * Selecting a unique package name helps avoid collisions between same overlay class names across different libraries.
 * You will reuse the same package name throughout your library for different Octo components you create.
 * @param overlayName - a string that uniquely represents the name of the overlay.
 * @param schema - The schema of the overlay.
 *
 * @returns The decorated class.
 *
 * @see Definition of [Overlays](/docs/fundamentals/overlays).
 */
export function Overlay<T extends UnknownOverlay>(
  packageName: string,
  overlayName: string,
  schema: Constructable<OverlaySchema<T>>,
): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!ValidationUtility.validateRegex(overlayName, /^[A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid overlay name: ${overlayName}`);
    }
    if (!(constructor.prototype instanceof AOverlay)) {
      throw new Error(`Class "${constructor.name}" must extend the AOverlay class!`);
    }

    constructor.NODE_NAME = overlayName;
    constructor.NODE_PACKAGE = packageName;
    constructor.NODE_SCHEMA = schema;
    constructor.NODE_TYPE = NodeType.OVERLAY;

    const promise = container.get(ModelSerializationService).then((modelSerializationService) => {
      modelSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
