import type { Constructable } from '../app.type.js';
import { RegistrationErrorEvent } from '../events/error.event.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import type { App } from '../models/app/app.model.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { ModuleContainer } from '../modules/module.container.js';
import { type IModule } from '../modules/module.interface.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { EventService } from '../services/event/event.service.js';
import { Container } from '../functions/container/container.js';

type CommitHooksCallback = (
  app: App,
  modelTransaction: DiffMetadata[][],
  resourceTransaction: DiffMetadata[][],
) => Promise<void>;

export interface IModuleOptions {
  args?: { isArg: (arg: unknown) => boolean; name: string }[];
  imports?: (Constructable<IModule<unknown>> | string)[];
  postCommitHooks?: { callback: CommitHooksCallback }[];
  postModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  postResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
  preCommitHooks?: { callback: CommitHooksCallback }[];
  preModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  preResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
}

/**
 * A `@Module` is a class decorator to be placed on top of a class that represents a module.
 * - A Module class must implement the {@link IModule} interface.
 * - A Module class constructor is injected with the outputs of the modules it imports.
 * - The {@link IModule.onInit} method is called to initialize the module,
 * and is where you will *define* your infrastructure.
 *
 * @example
 * ```ts
 * @Module({
 *   args: [{ isArg: (app: App) => app instanceof App, name: 'app' }],
 *   imports: [OtherModule],
 *   postModelActionHooks: [{ ACTION_NAME: 'SomeAction', collectInput: () => { ... }, handle: () => { ... } }],
 * })
 * export class MyModule implements IModule<Region> {
 *   constructor(app: App) { ... }
 *
 *   async onInit(): Promise<Region> { ... }
 * }
 * ```
 * @group Decorators
 * @param options - Options to the module.
 * @param options.args - (optional) An array of arg validators to verify the args passed to the module's constructor.
 * - The `isArg` method receives an argument, and you must do your own type checking and return a boolean.
 * - The `name` property is the name of the argument.
 * @param options.imports - (optional) An array of modules to import.
 * @param options.postCommitHooks - (optional) An array of post-commit hooks.
 * - The `callback` method will be called after the transaction is committed.
 * This method receives the same arguments as {@link Octo.commitTransaction}.
 * @param options.postModelActionHooks - (optional) An array of post-model action hooks.
 * - The `ACTION_NAME` identifies the action on which this hook is registered.
 * - The `collectInput` method can be used to enrich the action inputs. It works the same as in {@link IModelAction}.
 * - The `handle` method will be called after the action is executed.
 * This method receives the same arguments as {@link IModelAction.handle}.
 * @param options.postResourceActionHooks - (optional) An array of post-resource action hooks.
 * - The `ACTION_NAME` identifies the action on which this hook is registered.
 * - The `handle` method will be called after the action is executed.
 * This method receives the same arguments as {@link IResourceAction.handle}.
 * @param options.preCommitHooks - (optional) An array of pre-commit hooks.
 * - The `callback` method will be called before the transaction is committed.
 * This method receives the same arguments as {@link Octo.commitTransaction}.
 * @param options.preModelActionHooks - (optional) An array of pre-model action hooks.
 * - The `ACTION_NAME` identifies the action on which this hook is registered.
 * - The `collectInput` method can be used to enrich the action inputs. It works the same as in {@link IModelAction}.
 * - The `handle` method will be called before the action is executed.
 * This method receives the same arguments as {@link IModelAction.handle}.
 * @param options.preResourceActionHooks - (optional) An array of pre-resource action hooks.
 * - The `ACTION_NAME` identifies the action on which this hook is registered.
 * - The `handle` method will be called before the action is executed.
 * @returns The decorated class.
 * @see Definition of [Modules](/docs/fundamentals/modules).
 */
export function Module({
  args = [],
  imports = [],
  postCommitHooks = [],
  postModelActionHooks = [],
  postResourceActionHooks = [],
  preCommitHooks = [],
  preModelActionHooks = [],
  preResourceActionHooks = [],
}: IModuleOptions = {}): (constructor: any) => void {
  return function (constructor: Constructable<IModule<unknown>>) {
    Container.get(ModuleContainer)
      .then((moduleContainer) => {
        // Verify classes with @Module implements IModule.
        if (!('onInit' in constructor.prototype)) {
          throw new Error(`Class "${constructor.name}" does not implement IModule!`);
        }

        moduleContainer.register(constructor, {
          args,
          imports,
          postCommitHooks,
          postModelActionHooks,
          postResourceActionHooks,
          preCommitHooks,
          preModelActionHooks,
          preResourceActionHooks,
        });
      })
      .catch((error) => {
        EventService.getInstance().emit(new RegistrationErrorEvent(error));
      });
  };
}
