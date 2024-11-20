import { type Constructable, NodeType, type OverlaySchema } from '../app.type.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from '../functions/container/container.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * An `@Overlay` is a class decorator to be placed on top of a class that represents an overlay.
 * - An overlay must extend the {@link AOverlay} class.
 *
 * @example
 * ```ts
 * @Overlay('my-package', 'my-name')
 * export class MyOverlay extends AOverlay<MyOverlay> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Overlays](/docs/fundamentals/overlay-and-anchor).
 */
export function Overlay<T>(
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
