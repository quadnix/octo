import type { Constructable } from '../app.type.js';
import type { Octo } from '../main.js';
import type { IModelAction } from '../models/model-action.interface.js';
import { ModuleContainer } from '../modules/module.container.js';
import { type IModule } from '../modules/module.interface.js';
import type { IResourceAction } from '../resources/resource-action.interface.js';
import { Container } from './container.js';

export function Module({
  args = [],
  imports = [],
  postCommitHooks = [],
  postModelActionHooks = [],
  postResourceActionHooks = [],
  preCommitHooks = [],
  preModelActionHooks = [],
  preResourceActionHooks = [],
}: {
  args?: { isArg: (arg: unknown) => boolean; name: string }[];
  imports?: (Constructable<IModule<unknown>> | string)[];
  postCommitHooks?: { callback: Octo['commitTransaction'] }[];
  postModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  postResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
  preCommitHooks?: { callback: Octo['commitTransaction'] }[];
  preModelActionHooks?: {
    ACTION_NAME: string;
    collectInput?: IModelAction['collectInput'];
    handle: IModelAction['handle'];
  }[];
  preResourceActionHooks?: {
    ACTION_NAME: string;
    handle: IResourceAction['handle'];
  }[];
}): (constructor: any) => void {
  return function (constructor: Constructable<IModule<unknown>>) {
    Container.get(ModuleContainer).then((moduleContainer) => {
      // Verify classes with @Module implements IModule.
      if (!('onInit' in constructor)) {
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
    });
  };
}
