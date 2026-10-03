import { type Constructable, NodeType, type ResourceSchema, type UnknownResource } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AResource } from '../resources/resource.abstract.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * Every dot path through `T` that ends at a string, with `[]` after a key holding an array. Below a key
 * typed `unknown` any path is accepted.
 */
type NamePath<T, Depth extends unknown[] = []> = Depth['length'] extends 6
  ? never
  : {
      [K in keyof T & string]-?: unknown extends T[K]
        ? K | `${K}.${string}` | `${K}[]` | `${K}[].${string}`
        : NonNullable<T[K]> extends readonly (infer E)[]
          ?
              | (NonNullable<E> extends string ? `${K}[]` : never)
              | (NonNullable<E> extends object ? `${K}[].${NamePath<NonNullable<E>, [...Depth, unknown]>}` : never)
          : NonNullable<T[K]> extends string
            ? K
            : NonNullable<T[K]> extends object
              ? `${K}.${NamePath<NonNullable<T[K]>, [...Depth, unknown]>}`
              : never;
    }[keyof T & string];

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
 * A resource whose properties hold a name the cloud requires unique declares it in `options.uniqueProperties`, and
 * generate refuses two values of `path` that share the values of `within`, whether they come from two
 * resources of the class or from one.
 *
 * @example
 * ```ts
 * @Resource<MyTable>('@example', 'my-table', MyTableSchema, {
 *   uniqueProperties: [
 *     { path: 'tableName', within: ['accountId', 'regionId'] },
 *     { path: 'indexes[].name', within: ['accountId', 'regionId'] },
 *   ],
 * })
 * export class MyTable extends AResource<MyTableSchema, MyTable> { ... }
 * ```
 *
 * @group Decorators
 *
 * @param packageName - The name of the package under which the resource is registered.
 * Selecting a unique package name helps avoid collisions between same resource class names across different libraries.
 * You will reuse the same package name throughout your library for different Octo components you create.
 * @param resourceName - a string that uniquely represents the name of the resource.
 * @param schema - The schema of the resource.
 * @param options - Optional settings of the resource.
 * `uniqueProperties` lists the names the cloud requires unique, one entry per name.
 * - `path` is a dot path through the resource's properties, with `[]` after a key holding an array.
 *   A resource with no value at `path` is not checked.
 * - `within` names the properties whose values form the name's domain. A resource missing one is refused.
 *   An empty `within` makes the name unique across the app.
 *
 * Only resources of one class are compared with each other, and a class declaring no names is not checked.
 *
 * @returns The decorated class.
 *
 * @see Definition of [Resources](/docs/fundamentals/resources).
 */
export function Resource<T extends UnknownResource>(
  packageName: string,
  resourceName: string,
  schema: Constructable<ResourceSchema<T>>,
  {
    uniqueProperties = [],
  }: {
    uniqueProperties?: {
      path: NamePath<ResourceSchema<T>['properties']>;
      within: (keyof ResourceSchema<T>['properties'] & string)[];
    }[];
  } = {},
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
    constructor.UNIQUE_PROPERTIES = uniqueProperties.map(({ path, within }) => ({ path, within: [...within] }));

    const promise = container.get(ResourceSerializationService).then((resourceSerializationService) => {
      resourceSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
