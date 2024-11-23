import type { Constructable, ModuleSchema, UnknownModel, UnknownModule } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { ModuleError } from '../errors/index.js';
import { ModuleEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import { getSchemaInstance } from '../functions/schema/schema.js';
import { OverlayDataRepository } from '../overlays/overlay-data.repository.js';
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
    instances: { applied: boolean; inputKeys: string[]; moduleId: string }[];
    module: Constructable<UnknownModule>;
    properties: ModuleOptions;
  }[] = [];

  constructor(
    private readonly eventService: EventService,
    private readonly inputService: InputService,
    private readonly overlayDataRepository: OverlayDataRepository,
  ) {}

  async apply(): Promise<{ [key: string]: unknown }> {
    const result = {};

    for (const moduleMetadata of this.modules) {
      if (moduleMetadata.hidden) {
        continue;
      }

      const { instances, module } = moduleMetadata;
      for (const i of instances) {
        if (i.applied) {
          continue;
        }

        // Given a list of keys to the module, resolve the inputs with actual values.
        const resolvedModuleInputs = i.inputKeys.reduce((accumulator, current) => {
          accumulator[current] = this.inputService.resolve(`${i.moduleId}.input.${current}`);
          return accumulator;
        }, {});

        // Create an instance of module schema based on the resolved input values.
        // An error will be thrown if the resolved input does not match the module schema.
        const resolvedModuleSchema = getSchemaInstance(
          (module as unknown as typeof AModule).MODULE_SCHEMA,
          resolvedModuleInputs,
        );

        // Run module. Register module output, and return the module output.
        const instance = new module();
        const model = (await instance.onInit(resolvedModuleSchema)) as UnknownModel;
        if (model instanceof AOverlay) {
          this.overlayDataRepository.add(model);
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

  getModuleInstanceInputKeys(moduleId: string): string[] {
    const moduleIndex = this.modules.findIndex((m) => m.instances.findIndex((i) => i.moduleId === moduleId) !== -1);
    if (moduleIndex === -1) {
      throw new ModuleError(`Module "${moduleId}" not yet loaded!`, moduleId);
    }
    return this.modules[moduleIndex].instances.find((i) => i.moduleId === moduleId)!.inputKeys;
  }

  load<M extends UnknownModule>(
    module: Constructable<M> | string,
    moduleId: string,
    inputs: Record<keyof ModuleSchema<M>, string>,
  ): void {
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
    m.instances.push({ applied: false, inputKeys: Object.keys(inputs), moduleId });

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
    const [eventService, inputService, overlayDataRepository] = await Promise.all([
      Container.getInstance().get(EventService),
      Container.getInstance().get(InputService),
      Container.getInstance().get(OverlayDataRepository),
    ]);

    if (!this.instance) {
      this.instance = new ModuleContainer(eventService, inputService, overlayDataRepository);
    }

    if (forceNew) {
      this.instance.reset();
    }

    return this.instance;
  }
}
