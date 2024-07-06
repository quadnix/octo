import type { Module } from '../../decorators/module.decorator.js';
import { type IModelAction } from '../../models/model-action.interface.js';
import { type IResourceAction } from '../../resources/resource-action.interface.js';

export abstract class AHook {
  protected readonly registeredModules: { moduleName: string; moduleProperties: Parameters<typeof Module>[0] }[] = [];

  abstract collectHooks(): void;

  registerModule(moduleName: string, moduleProperties: Parameters<typeof Module>[0]): void {
    if (this.registeredModules.some((m) => m.moduleName === moduleName)) {
      throw new Error('Module already registered! Has the module been declared more than once?');
    }

    // Rearrange registered modules based on imports. Before insertion,
    // check if the current module is marked as an import of another module. If so, insert before that module.
    let insertAtPosition = -1;
    for (const m of this.registeredModules) {
      if (m.moduleProperties.imports?.some((i) => i.name === moduleName)) {
        insertAtPosition = this.registeredModules.indexOf(m);
        break;
      }
    }
    if (insertAtPosition >= 0) {
      this.registeredModules.splice(insertAtPosition, 0, { moduleName, moduleProperties });
    } else {
      this.registeredModules.push({ moduleName, moduleProperties });
    }

    this.collectHooks();
  }

  abstract registrar(arg: IModelAction | IResourceAction | PropertyDescriptor): void;
}
