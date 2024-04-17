import { Module } from '../../decorators/module.decorator.js';
import { Constructable } from '../../app.type.js';

export abstract class AHook {
  protected readonly registeredModules: { moduleName: string; moduleProperties: Parameters<typeof Module>[0] }[] = [];

  abstract generateCallbacks(): void;

  register(moduleName: string, moduleProperties: Parameters<typeof Module>[0]): void {
    if (this.registeredModules.some((m) => m.moduleName === moduleName)) {
      throw new Error('Module already registered!');
    }
    this.registeredModules.push({ moduleName, moduleProperties });
    this.generateCallbacks();
  }

  abstract registrar(constructor: Constructable<unknown>, propertyKey: string, descriptor: PropertyDescriptor): void;
}
