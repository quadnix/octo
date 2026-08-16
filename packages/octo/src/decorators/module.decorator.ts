import type { Constructable, ModuleSchema } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AModule } from '../modules/module.abstract.js';
import { ModuleContainer } from '../modules/module.container.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Module` is a class decorator and must be placed on top of a class representing a module.
 * - A module must also extend the {@link AModule} class.
 * - For type safety, the type of module being decorated is passed to the decorator.
 *
 * Decorating a class registers it with Octo, which is what makes the module loadable by name
 * with {@link Octo.loadModule}.
 *
 * @example
 * ```ts
 * @Module<MyModule>('@example', MyModuleSchema)
 * export class MyModule extends AModule<MyModuleSchema, MyRegion> { ... }
 * ```
 *
 * @group Decorators
 *
 * @param packageName - The name of the package under which the module is registered.
 * Selecting a unique package name helps avoid collisions between same module class names across different libraries.
 * You will reuse the same package name throughout your library for different Octo components you create.
 * @param schema - The schema of the module, describing the inputs it accepts.
 *
 * @returns The decorated class.
 *
 * @see Definition of [Modules](/docs/fundamentals/modules).
 */
export function Module<T>(packageName: string, schema: Constructable<ModuleSchema<T>>): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!(constructor.prototype instanceof AModule)) {
      throw new Error(`Class "${constructor.name}" must extend the AModule class!`);
    }

    constructor.MODULE_PACKAGE = packageName;
    constructor.MODULE_SCHEMA = schema;

    const promise = container.get(ModuleContainer).then((moduleContainer) => {
      moduleContainer.register(constructor, { packageName });
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
