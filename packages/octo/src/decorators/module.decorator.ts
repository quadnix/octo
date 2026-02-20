import type { Constructable, ModuleSchema } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AModule } from '../modules/module.abstract.js';
import { ModuleContainer } from '../modules/module.container.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Module` is a class decorator to be placed on top of a class that represents a module.
 * - A Module class must implement the {@link IModule} interface.
 * - The {@link IModule.onInit} method is called to initialize the module,
 * and is where you will *define* your infrastructure.
 *
 * @example
 * ```ts
 * @Module<MyInputInterface, OutputModel>('my-package', {})
 * export class MyModule implements IModule<Region> {
 *   constructor(inputs: IMyInputs) { ... }
 *
 *   async onInit(): Promise<Region> { ... }
 * }
 * ```
 * @group Decorators
 * @param packageName The package name that owns this module (e.g. `'@my-package'`).
 *   Must match the regex `^[@A-Za-z][\w-]+[A-Za-z]$`.
 * @param schema The module's input schema class, used to validate inputs passed
 *   to {@link Octo.loadModule} at registration time.
 * @returns The decorated class.
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
