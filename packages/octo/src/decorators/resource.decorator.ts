import { NodeType } from '../app.type.js';
import { AResource } from '../resources/resource.abstract.js';
import { ASharedResource } from '../resources/shared-resource.abstract.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Container } from '../functions/container/container.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Resource` is a class decorator to be placed on top of a class that represents a resource.
 * - A resource must extend the {@link AResource} class.
 *
 * @example
 * ```ts
 * @Resource('my-package', 'my-name')
 * export class MyResource extends AResource<MyResource> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Resources](http://localhost:3000/docs/fundamentals/resources).
 */
export function Resource(packageName: string, resourceName: string): (constructor: any) => void {
  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!ValidationUtility.validateRegex(resourceName, /^[A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid resource name: ${resourceName}`);
    }
    if (!(constructor.prototype instanceof AResource) && !(constructor.prototype instanceof ASharedResource)) {
      throw new Error(`Class "${constructor.name}" must extend the AResource or ASharedResource class!`);
    }

    constructor.NODE_NAME = resourceName;
    constructor.NODE_PACKAGE = packageName;
    constructor.NODE_TYPE =
      constructor.prototype instanceof ASharedResource ? NodeType.SHARED_RESOURCE : NodeType.RESOURCE;

    const promise = Container.get(ResourceSerializationService).then((resourceSerializationService) => {
      resourceSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    Container.registerStartupUnhandledPromise(promise);
  };
}
