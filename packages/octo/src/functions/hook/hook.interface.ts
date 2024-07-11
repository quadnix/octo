import type { IModelAction } from '../../models/model-action.interface.js';
import type { ModuleContainer } from '../../modules/module.container.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';

export interface IHook {
  collectHooks(registeredModules: ModuleContainer['modules']): void;

  registrar(arg: IModelAction | IResourceAction | PropertyDescriptor): void;

  reset(): void;
}
