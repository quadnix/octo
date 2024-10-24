import type { Constructable, ModuleConstructorArgs } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { ModuleError } from '../errors/index.js';
import { ModuleEvent } from '../events/index.js';
import { EventService } from '../services/event/event.service.js';
import { IModule } from './module.interface.js';

type ModuleOptions = {
  inputs: { [key: string]: unknown };
  packageName: string;
};

export class ModuleContainer {
  private readonly modules: {
    applied: boolean;
    applyOrder: number;
    hidden: boolean;
    module: Constructable<IModule<unknown>>;
    properties: ModuleOptions;
  }[] = [];

  private readonly outputs: { [key: string]: unknown } = {};

  async apply(): Promise<void> {
    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.applied || moduleMetadata.hidden) {
        continue;
      }

      const { module, properties } = moduleMetadata;
      const instance = new module(properties.inputs);

      const output = await instance.onInit();
      if (output) {
        this.outputs[module.name] = output;
      }

      moduleMetadata.applied = true;
      EventService.getInstance().emit(new ModuleEvent(module.name));
    }
  }

  getModuleMetadata(module: Constructable<IModule<unknown>> | string): ModuleContainer['modules'][0] | undefined {
    const index = this.getModuleMetadataIndex(module);
    return index === -1 ? undefined : this.modules[index];
  }

  getModuleMetadataIndex(module: Constructable<IModule<unknown>> | string): number {
    const name = typeof module === 'string' ? module : module.name;
    return this.modules.findIndex((m) => m.module.name === name);
  }

  getOutput<T>(module: Constructable<IModule<T>> | string): T | undefined {
    const name = typeof module === 'string' ? module : module.name;
    return name in this.outputs ? (this.outputs[name] as T) : undefined;
  }

  load<M>(module: { new (...args: any): IModule<unknown> }, inputs: ModuleConstructorArgs<M>[0]): void {
    const m = this.getModuleMetadata(module);
    if (!m) {
      throw new ModuleError(`Module ${module.name} not yet registered!`, module.name);
    }

    m.hidden = false;

    for (const [key, value] of Object.entries(inputs || {})) {
      m.properties.inputs[key] = JSON.parse(JSON.stringify(value));
    }
  }

  register(module: Constructable<IModule<unknown>>, properties: ModuleOptions): void {
    if (!this.modules.some((m) => m.module.name === module.name)) {
      this.modules.push({ applied: false, applyOrder: -1, hidden: true, module, properties });
    }
  }

  reset(): void {
    for (const name in this.outputs) {
      delete this.outputs[name];
    }

    this.modules.map((m) => {
      m.applied = false;
      m.applyOrder = -1;
      m.hidden = true;
    });
  }

  unload(module: Constructable<IModule<unknown>>): void {
    const m = this.getModuleMetadata(module);
    if (m) {
      m.hidden = true;
    }
  }
}

@Factory<ModuleContainer>(ModuleContainer)
export class ModuleContainerFactory {
  private static instance: ModuleContainer;

  static async create(): Promise<ModuleContainer> {
    if (!this.instance) {
      this.instance = new ModuleContainer();
    }
    return this.instance;
  }
}
