import { ModuleError } from '../errors/index.js';
import type { AModel } from '../models/model.abstract.js';
import { ModuleContainer } from '../modules/module.container.js';
import type { IModule } from '../modules/module.interface.js';
import { Container } from '../functions/container/container.js';
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
 * @returns The decorated class.
 * @see Definition of [Modules](/docs/fundamentals/modules).
 */
export function Module<I, O extends AModel<unknown, unknown>>(
  packageName: string,
): (constructor: { new (inputs: I): IModule<O> }) => void {
  const container = Container.getInstance();

  return function (constructor: { new (inputs: I): IModule<O> }) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }

    const promise = container.get(ModuleContainer).then((moduleContainer) => {
      // Verify classes with @Module implements IModule.
      if (!('onInit' in constructor.prototype)) {
        throw new ModuleError('Module does not implement IModule!', constructor.name);
      }

      moduleContainer.register(constructor, {
        inputs: {},
        packageName,
      });
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
