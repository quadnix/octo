import { Constructable } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { type Module } from '../decorators/module.decorator.js';
import { ModuleEvent } from '../events/module.event.js';
import { CommitHook } from '../functions/hook/commit.hook.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import { EventService } from '../services/event/event.service.js';
import { IModule } from './module.interface.js';

export class ModuleContainer {
  private readonly modules: {
    applied: boolean;
    applyOrder: number;
    hidden: boolean;
    module: Constructable<IModule<unknown>>;
    properties: Parameters<typeof Module>[0];
  }[] = [];

  private readonly outputs: { [key: string]: unknown } = {};

  constructor(
    private readonly commitHook: CommitHook,
    private readonly modelActionHook: ModelActionHook,
    private readonly resourceActionHook: ResourceActionHook,
  ) {}

  async apply(): Promise<void> {
    for (const moduleMetadata of this.modules) {
      this.setApplyOrder(moduleMetadata);
    }
    this.modules.sort((a, b) => a.applyOrder - b.applyOrder);

    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.applied || moduleMetadata.hidden) {
        continue;
      }

      const { module, properties } = moduleMetadata;

      this.commitHook.collectHooks([moduleMetadata]);
      this.modelActionHook.collectHooks([moduleMetadata]);
      this.resourceActionHook.collectHooks([moduleMetadata]);

      const args = (properties.imports || []).reduce((accumulator: unknown[], importedModule) => {
        const name = typeof importedModule === 'string' ? importedModule : importedModule.name;
        if (name in this.outputs) {
          accumulator.push(this.outputs[name]);
        }
        return accumulator;
      }, []);
      for (const [i, { isArg, name }] of (properties.args || []).entries()) {
        if (!isArg(args[i])) {
          // eslint-disable-next-line max-len
          const message = `Module "${module.name}" requires an argument at position [${i}] of type "${name}", but received "${typeof args[i]}"!`;
          throw new Error(message);
        }
      }

      const instance = new module(...args);

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

  load(module: Constructable<IModule<unknown>>): void {
    const m = this.getModuleMetadata(module);
    if (m) {
      m.hidden = false;
    }
  }

  register(module: Constructable<IModule<unknown>>, properties: Parameters<typeof Module>[0]): void {
    if (!this.modules.some((m) => m.module.name === module.name)) {
      this.modules.push({ applied: false, applyOrder: -1, hidden: true, module, properties });
    }
  }

  reset(): void {
    this.commitHook.reset();
    this.modelActionHook.reset();
    this.resourceActionHook.reset();

    for (const name in this.outputs) {
      delete this.outputs[name];
    }

    this.modules.map((m) => {
      m.applied = false;
      m.applyOrder = -1;
      m.hidden = true;
    });
  }

  private setApplyOrder(
    moduleMetadata: ModuleContainer['modules'][0],
    seen: ModuleContainer['modules'][0]['module'][] = [],
  ): void {
    if (moduleMetadata.applyOrder >= 0) {
      return;
    }

    if (seen.find((m) => m.name === moduleMetadata.module.name)) {
      throw new Error('Found circular dependencies in modules!');
    }

    const parentModuleApplyOrders: number[] = [-1];
    for (const parent of moduleMetadata.properties.imports || []) {
      const name = typeof parent === 'string' ? parent : parent.name;
      const parentModuleMetadata = this.modules.find((m) => m.module.name === name);
      if (!parentModuleMetadata) {
        throw new Error(`Found unregistered module "${name}" while processing modules!`);
      }

      this.setApplyOrder(parentModuleMetadata, [...seen, parentModuleMetadata.module]);
      parentModuleApplyOrders.push(parentModuleMetadata.applyOrder);
    }

    moduleMetadata.applyOrder = Math.max(...parentModuleApplyOrders) + 1;
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
      const commitHook = CommitHook.getInstance();
      const modelActionHook = ModelActionHook.getInstance();
      const resourceActionHook = ResourceActionHook.getInstance();
      this.instance = new ModuleContainer(commitHook, modelActionHook, resourceActionHook);
    }
    return this.instance;
  }
}
