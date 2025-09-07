import { type Constructable, NodeType, type ResourceSchema, type UnknownResource } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AResource } from '../resources/resource.abstract.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Resource` is a class decorator and must be placed on top of a class representing a resource.
 * - A resource must also extend the {@link AResource} class.
 * - For type safety, the type of resource being decorated is passed to the decorator.
 *
 * @example
 * ```ts
 * @Resource<MyResource>('@example', 'my-name', MyResourceSchema)
 * export class MyResource extends AResource<MyResourceSchema, MyResource> { ... }
 * ```
 *
 * @group Decorators
 *
 * @param packageName - The name of the package under which the resource is registered.
 * Selecting a unique package name helps avoid collisions between same resource class names across different libraries.
 * You will reuse the same package name throughout your library for different Octo components you create.
 * @param resourceName - a string that uniquely represents the name of the resource.
 * @param schema - The schema of the resource.
 *
 * @returns The decorated class.
 *
 * @see Definition of [Resources](/docs/fundamentals/resources).
 */
export function Resource<T extends UnknownResource>(
  packageName: string,
  resourceName: string,
  schema: Constructable<ResourceSchema<T>>,
): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!ValidationUtility.validateRegex(resourceName, /^[A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid resource name: ${resourceName}`);
    }
    if (!(constructor.prototype instanceof AResource)) {
      throw new Error(`Class "${constructor.name}" must extend the AResource class!`);
    }

    constructor.NODE_NAME = resourceName;
    constructor.NODE_PACKAGE = packageName;
    constructor.NODE_SCHEMA = schema;
    constructor.NODE_TYPE = NodeType.RESOURCE;

    const promise = container.get(ResourceSerializationService).then((resourceSerializationService) => {
      resourceSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
