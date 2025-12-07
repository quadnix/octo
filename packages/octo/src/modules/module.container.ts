import type { Constructable, ModuleSchemaInputs, UnknownModel, UnknownModule } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { InputRegistrationError, ModuleError } from '../errors/index.js';
import { ModuleEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import { CommitHook } from '../functions/hook/commit.hook.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import type { ANode } from '../functions/node/node.abstract.js';
import { getSchemaInstance, getSchemaKeys } from '../functions/schema/schema.js';
import { OverlayDataRepository } from '../overlays/overlay-data.repository.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { EventService } from '../services/event/event.service.js';
import { InputService } from '../services/input/input.service.js';
import type { AModule } from './module.abstract.js';

type ModuleOptions = {
  packageName: string;
};

/**
 * @internal
 */
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
        const { module } = moduleMetadata;

        // Create new module instance.
        const instance = new module('');
        // Register module hooks.
        this.registerHooks(instance.registerHooks());

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

        // Re-register module inputs. This now includes all the optional properties that were not provided in inputs.
        for (const [key, value] of Object.entries(resolvedModuleSchema)) {
          try {
            this.inputService.registerInput(i.moduleId, key, value);
          } catch (error) {
            if (!(error instanceof InputRegistrationError)) {
              throw error;
            }
          }
        }

        // Create new module instance.
        const instance = new module(i.moduleId);
        // Register module hooks.
        this.registerHooks(instance.registerHooks());
        // Register module metadata.
        const metadata = await instance.registerMetadata(resolvedModuleSchema);
        for (const [key, value] of Object.entries(metadata)) {
          this.inputService.registerMetadata(i.moduleId, key, value);
        }

        // Run module. Register module output, and return the module output.
        let models = (await instance.onInit(resolvedModuleSchema)) as UnknownModel | UnknownModel[];
        if (!Array.isArray(models)) {
          models = [models];
        }

        // Register module outputs.
        for (const model of models) {
          if (model instanceof AOverlay) {
            this.overlayDataRepository.add(model);
            this.inputService.registerOverlay(i.moduleId, model);
            result[`${i.moduleId}.overlay.${model.overlayId}`] = model;
          } else {
            this.inputService.registerModel(i.moduleId, model);
            result[`${i.moduleId}.model.${(model.constructor as typeof ANode).NODE_NAME}`] = model;
          }
        }
        // Register module.
        this.inputService.registerModule(i.moduleId, instance);

        i.applied = true;
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
    inputs: ModuleSchemaInputs<M>,
  ): void {
    const moduleName =
      typeof module === 'string' ? module : `${(module as unknown as typeof AModule).MODULE_PACKAGE}/${module.name}`;
    const m = this.getMetadata(module);
    if (!m) {
      throw new ModuleError(`Module "${moduleName}" not yet registered!`, moduleName);
    }

    m.hidden = false;

    if (m.instances.findIndex((i) => i.moduleId === moduleId) !== -1) {
      return;
    }

    m.instances.push({
      applied: false,
      inputKeys: getSchemaKeys((module as unknown as typeof AModule).MODULE_SCHEMA),
      moduleId,
    });
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

  registerHooks({
    postCommitHooks,
    postModelActionHooks,
    postResourceActionHooks,
    preCommitHooks,
    preModelActionHooks,
    preResourceActionHooks,
  }: {
    postCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['postHooks'];
    postModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['postHooks'];
    postResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['postHooks'];
    preCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['preHooks'];
    preModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['preHooks'];
    preResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['preHooks'];
  } = {}): void {
    CommitHook.getInstance().collectHooks({ postHooks: postCommitHooks, preHooks: preCommitHooks });
    ModelActionHook.getInstance().collectHooks({
      postHooks: postModelActionHooks,
      preHooks: preModelActionHooks,
    });
    ResourceActionHook.getInstance().collectHooks({
      postHooks: postResourceActionHooks,
      preHooks: preResourceActionHooks,
    });
  }

  reset(): void {
    for (const m of this.modules) {
      m.hidden = true;
      m.instances = [];
    }
  }

  unload(module: Constructable<UnknownModule>): void {
    const m = this.getMetadata(module);
    if (m) {
      m.hidden = true;
    }
  }
}

/**
 * @internal
 */
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
