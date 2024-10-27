import type { Constructable, ModuleConstructorArgs, UnknownModel } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { ModuleError } from '../errors/index.js';
import { ModuleEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import { EventService } from '../services/event/event.service.js';
import { InputService } from '../services/input/input.service.js';
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

  constructor(private readonly inputService: InputService) {}

  async apply(): Promise<void> {
    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.applied || moduleMetadata.hidden) {
        continue;
      }

      const { module, properties } = moduleMetadata;
      const instance = new module(properties.inputs);

      const model = (await instance.onInit()) as UnknownModel;
      this.inputService.registerModels([model]);

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
    const inputService = await Container.getInstance().get(InputService);
    if (!this.instance) {
      this.instance = new ModuleContainer(inputService);
    }
    return this.instance;
  }
}
