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
  private modules: {
    hidden: boolean;
    instances: { applied: boolean; moduleId: string }[];
    module: Constructable<UnknownModule>;
    properties: ModuleOptions;
  }[] = [];

  constructor(
    private readonly eventService: EventService,
    private readonly inputService: InputService,
  ) {}

  async apply(): Promise<{ [key: string]: unknown }> {
    const result = {};

    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.hidden) {
        continue;
      }

      const { instances, module, properties } = moduleMetadata;
      for (const i of instances) {
        if (i.applied) {
          continue;
        }

        const instance = new module();
        const moduleInputs = instance.collectInputs();

        const resolvedModuleInputs = moduleInputs.reduce((accumulator, current) => {
          const resolvedInput = this.inputService.resolve(`${i.moduleId}.input.${current}`);
          if (!resolvedInput) {
            const moduleName = `${properties.packageName}/${module.name}`;
            throw new ModuleError(`Module "${moduleName}" inputs are not resolved!`, moduleName);
          }
          accumulator[current] = resolvedInput;
          return accumulator;
        }, {});

        const model = (await instance.onInit(resolvedModuleInputs)) as UnknownModel;
        if (model instanceof AOverlay) {
          this.inputService.registerOverlay(i.moduleId, model);
        } else {
          this.inputService.registerModel(i.moduleId, model);
        }

        i.applied = true;
        result[i.moduleId] = model;
      }

      this.eventService.emit(new ModuleEvent(module.name));
    }

    return result;
  }

  getMetadata(module: Constructable<UnknownModule> | string): ModuleContainer['modules'][0] | undefined {
    const index = this.getMetadataIndex(module);
    return index === -1 ? undefined : this.modules[index];
  }

  getMetadataIndex(module: Constructable<UnknownModule> | string): number {
    const moduleName =
      typeof module === 'string' ? module : `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    return this.modules.findIndex((m) => `${m.properties.packageName}/${m.module.name}` === moduleName);
  }

  load<M extends UnknownModule>(module: Constructable<M> | string, moduleId: string, inputs: ModuleInputs<M>): void {
    const moduleName =
      typeof module === 'string' ? module : `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    const m = this.getMetadata(module);
    if (!m) {
      throw new ModuleError(`Module "${moduleName}" not yet registered!`, moduleName);
    }

    m.hidden = false;

    if (m.instances.findIndex((i) => i.moduleId === moduleId) !== -1) {
      throw new ModuleError('Module already loaded!', moduleName);
    }
    m.instances.push({ applied: false, moduleId });

    for (const [key, value] of Object.entries(inputs)) {
      this.inputService.registerInput(moduleId, key, JSON.parse(JSON.stringify(value)));
    }
  }

  order(modules: (Constructable<UnknownModule> | string)[]): void {
    this.modules.sort((a, b) => {
      const aIndex = modules.findIndex((m) => {
        const moduleName = typeof m === 'string' ? m : `${(m as unknown as typeof AModule).MODULE_PACKAGE}/${m.name}`;
        return `${a.properties.packageName}/${a.module.name}` === moduleName;
      });
      const bIndex = modules.findIndex((m) => {
        const moduleName = typeof m === 'string' ? m : `${(m as unknown as typeof AModule).MODULE_PACKAGE}/${m.name}`;
        return `${b.properties.packageName}/${b.module.name}` === moduleName;
      });
      return aIndex - bIndex;
    });
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
      m.instances = [];
    });
  }

  unload(module: Constructable<UnknownModule>): void {
    const m = this.getMetadata(module);
    if (m) {
      m.hidden = true;
    }
  }
}

@Factory<ModuleContainer>(ModuleContainer)
export class ModuleContainerFactory {
  private static instance: ModuleContainer;

  static async create(forceNew: boolean = false): Promise<ModuleContainer> {
    const [eventService, inputService] = await Promise.all([
      Container.getInstance().get(EventService),
      Container.getInstance().get(InputService),
    ]);

    if (!this.instance) {
      this.instance = new ModuleContainer(eventService, inputService);
    }

    if (forceNew) {
      this.instance.reset();
    }

    return this.instance;
  }
}
