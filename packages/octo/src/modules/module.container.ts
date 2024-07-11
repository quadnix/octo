import { Constructable } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { type Module } from '../decorators/module.decorator.js';
import { CommitHook } from '../functions/hook/commit.hook.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
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
        if (importedModule.name in this.outputs) {
          accumulator.push(this.outputs[importedModule.name]);
        }
        return accumulator;
      }, []);
      for (const [i, { name, isArg }] of (properties.args || []).entries()) {
        if (!isArg(args[i])) {
          // eslint-disable-next-line max-len
          const message = `Module "${module.name}" requires an argument at [${i}] of type "${name}", but received "${typeof args[i]}"!`;
          throw new Error(message);
        }
      }

      const instance = new module(...args);

      const output = await instance.onInit();
      if (output) {
        this.outputs[module.name] = output;
      }

      moduleMetadata.applied = true;
    }
  }

  getModuleMetadata(module: Constructable<IModule<unknown>>): ModuleContainer['modules'][0] | undefined {
    const index = this.getModuleMetadataIndex(module);
    return index === -1 ? undefined : this.modules[index];
  }

  getModuleMetadataIndex(module: Constructable<IModule<unknown>>): number {
    return this.modules.findIndex((m) => m.module.name === module.name);
  }

  getOutput<T>(module: Constructable<IModule<T>>): T | undefined {
    return module.name in this.outputs ? (this.outputs[module.name] as T) : undefined;
  }

  register(module: Constructable<IModule<unknown>>, properties: Parameters<typeof Module>[0]): void {
    if (!this.modules.some((m) => m.module.name === module.name)) {
      this.modules.push({ applied: false, applyOrder: -1, hidden: false, module, properties });
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
      m.hidden = false;
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
      const parentModuleMetadata = this.modules.find((m) => m.module.name === parent.name);
      if (!parentModuleMetadata) {
        throw new Error(`Found unregistered module "${parent.name}" while processing modules!`);
      }

      this.setApplyOrder(parentModuleMetadata, [...seen, parentModuleMetadata.module]);
      parentModuleApplyOrders.push(parentModuleMetadata.applyOrder);
    }

    moduleMetadata.applyOrder = Math.max(...parentModuleApplyOrders) + 1;
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
