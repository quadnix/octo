import type { Module } from '../../decorators/module.decorator.js';
import type { Constructable } from '../../app.type.js';

export abstract class AHook {
  protected readonly registeredModules: { moduleName: string; moduleProperties: Parameters<typeof Module>[0] }[] = [];

  abstract generateCallbacks(): void;

  register(moduleName: string, moduleProperties: Parameters<typeof Module>[0]): void {
    if (this.registeredModules.some((m) => m.moduleName === moduleName)) {
      throw new Error('Module already registered!');
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

    this.generateCallbacks();
  }

  abstract registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void;
}
