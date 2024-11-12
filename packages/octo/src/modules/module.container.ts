import type { Constructable, ModuleInputs, UnknownModel, UnknownModule } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { ModuleError } from '../errors/index.js';
import { ModuleEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { EventService } from '../services/event/event.service.js';
import { InputService } from '../services/input/input.service.js';
import type { AModule } from './module.abstract.js';

type ModuleOptions = {
  packageName: string;
};

export class ModuleContainer {
  private readonly modules: {
    hidden: boolean;
    instances: string[];
    module: Constructable<UnknownModule>;
    properties: ModuleOptions;
  }[] = [];

  constructor(private readonly inputService: InputService) {}

  async apply(): Promise<void> {
    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.hidden) {
        continue;
      }

      const { instances, module, properties } = moduleMetadata;
      for (const moduleId of instances) {
        const instance = new module();
        const moduleInputs = instance.collectInputs();

        const resolvedModuleInputs = moduleInputs.reduce((accumulator, current) => {
          const resolvedInput = this.inputService.resolve(`${moduleId}.input.${current}`);
          if (!resolvedInput) {
            const moduleName = `${properties.packageName}/${module.name}`;
            throw new ModuleError(`Module "${moduleName}" inputs are not resolved!`, moduleName);
          }
          accumulator[current] = resolvedInput;
          return accumulator;
        }, {});

        const model = (await instance.onInit(resolvedModuleInputs)) as UnknownModel;
        if (model instanceof AOverlay) {
          this.inputService.registerOverlay(moduleId, model);
        } else {
          this.inputService.registerModel(moduleId, model);
        }
      }

      EventService.getInstance().emit(new ModuleEvent(module.name));
    }
  }

  getModuleMetadata(module: Constructable<UnknownModule> | string): ModuleContainer['modules'][0] | undefined {
    const index = this.getModuleMetadataIndex(module);
    return index === -1 ? undefined : this.modules[index];
  }

  getModuleMetadataIndex(module: Constructable<UnknownModule> | string): number {
    const moduleName =
      typeof module === 'string' ? module : `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    return this.modules.findIndex((m) => `${m.properties.packageName}/${m.module.name}` === moduleName);
  }

  load<M extends UnknownModule>(module: Constructable<M> | string, moduleId: string, inputs: ModuleInputs<M>): void {
    const moduleName =
      typeof module === 'string' ? module : `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    const m = this.getModuleMetadata(module);
    if (!m) {
      throw new ModuleError(`Module "${moduleName}" not yet registered!`, moduleName);
    }

    m.hidden = false;

    if (m.instances.includes(moduleId)) {
      throw new ModuleError('Module already loaded!', moduleName);
    }
    m.instances.push(moduleId);

    for (const [key, value] of Object.entries(inputs)) {
      this.inputService.registerInput(moduleId, key, JSON.parse(JSON.stringify(value)));
    }
  }

  register(module: Constructable<UnknownModule>, properties: ModuleOptions): void {
    const moduleName = `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    if (!this.modules.some((m) => `${m.properties.packageName}/${m.module.name}` === moduleName)) {
      this.modules.push({ hidden: true, instances: [], module, properties });
    }
  }

  reset(): void {
    this.modules.map((m) => {
      m.hidden = true;
    });
  }

  unload(module: Constructable<UnknownModule>): void {
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
      const inputService = await Container.getInstance().get(InputService);
      this.instance = new ModuleContainer(inputService);
    }
    return this.instance;
  }
}
