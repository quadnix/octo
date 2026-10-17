import type { ActionOutputs, ResourceSerializedOutput, UnknownResource } from '../../../app.type.js';
import { EventSource } from '../../../decorators/event-source.decorator.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { ResourceError } from '../../../errors/index.js';
import {
  ActualResourceSerializedEvent,
  NewResourceSerializedEvent,
  ResourceDeserializedEvent,
  ResourceRegistrationEvent,
} from '../../../events/index.js';
import { Container } from '../../../functions/container/container.js';
import type { IDependency } from '../../../functions/dependency/dependency.js';
import {
  ResourceDataRepository,
  type ResourceDataRepositoryFactory,
} from '../../../resources/resource-data.repository.js';
import type { AResource } from '../../../resources/resource.abstract.js';
import { ATerraformResource } from '../../../resources/terraform-resource.abstract.js';
import { ObjectUtility } from '../../../utilities/object/object.utility.js';
import { InputService } from '../../input/input.service.js';

/**
 * @internal
 */
export class ResourceSerializationService {
  private actualResources = new Map<string, { models: string[]; moduleId: string }>(); // Resource context -> record in state.
  private readonly classMapping: { [key: string]: any } = {};

  private readonly RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS = 3000;

  /**
   * @internal
   */
  constructor(
    private readonly resourceDataRepository: ResourceDataRepository,
    private readonly inputService: InputService,
  ) {}

  /**
   * @internal
   */
  @EventSource(ResourceDeserializedEvent)
  async deserialize(
    actualSerializedOutput: ResourceSerializedOutput,
    oldSerializedOutput: ResourceSerializedOutput,
  ): Promise<void> {
    const actualResources = await this._deserialize(JSON.parse(JSON.stringify(actualSerializedOutput)), false);
    this.actualResources = new Map(
      Object.entries(actualSerializedOutput.resources).map(([context, { models, moduleId }]) => [
        context,
        { models, moduleId },
      ]),
    );
    const oldResources = await this._deserialize(JSON.parse(JSON.stringify(oldSerializedOutput)), true);

    // Refresh the resource data repository.
    await Container.getInstance().get<ResourceDataRepository, typeof ResourceDataRepositoryFactory>(
      ResourceDataRepository,
      {
        args: [true, Object.values(actualResources), Object.values(oldResources), []],
      },
    );
  }

  /**
   * The module that produced a committed resource, as the state it was loaded from records it.
   */
  getActualResourceModuleId(resource: UnknownResource): string | undefined {
    return this.actualResources.get(resource.getContext())?.moduleId;
  }

  /**
   * @internal
   */
  @EventSource(ResourceRegistrationEvent)
  registerClass(className: string, deserializationClass: any): void {
    if (this.classMapping[className]) {
      throw new Error(`Class "${className}" is already registered!`);
    }
    this.classMapping[className] = deserializationClass;
  }

  /**
   * @internal
   */
  @EventSource(ActualResourceSerializedEvent)
  async serializeActualResources(): Promise<ResourceSerializedOutput> {
    const resources = this.resourceDataRepository.getActualResourcesByProperties();
    return this.serialize(resources);
  }

  /**
   * @internal
   */
  @EventSource(NewResourceSerializedEvent)
  async serializeNewResources(): Promise<ResourceSerializedOutput> {
    const resources = this.resourceDataRepository.getNewResourcesByProperties();
    return this.serialize(resources);
  }

  /**
   * @internal
   */
  private async _deserialize(serializedOutput: ResourceSerializedOutput, freeze: boolean): Promise<ActionOutputs> {
    const deReferencePromises: {
      [p: string]: [Promise<boolean>, (value: boolean) => void, (error: Error) => void, NodeJS.Timeout];
    } = {};
    const seen: ActionOutputs = {};

    const deReferenceResource = async (context: string): Promise<UnknownResource> => {
      if (!seen[context]) {
        if (deReferencePromises[context]) {
          await deReferencePromises[context][0];
        } else {
          deReferencePromises[context] = [] as any;
          const promise = new Promise<boolean>((resolve, reject) => {
            deReferencePromises[context][1] = resolve;
            deReferencePromises[context][2] = reject;
          });
          deReferencePromises[context][0] = promise;

          deReferencePromises[context][3] = setTimeout(() => {
            deReferencePromises[context][2](new Error('DeReferencing resource operation timed out!'));
          }, this.RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS);
          await promise;
        }
      }

      return seen[context];
    };

    const deserializeResource = async (context: string): Promise<UnknownResource> => {
      const { className, resource } = serializedOutput.resources[context];
      const deserializationClass = this.classMapping[className];

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        deReferenceResource,
      );
      deserializedResource['context'] = context;

      seen[context] = deserializedResource;
      if (deReferencePromises[context]) {
        deReferencePromises[context][1](true);
        clearTimeout(deReferencePromises[context][3]);
      }

      return deserializedResource;
    };

    // Deserialize all serialized resources.
    const promiseToDeserializeResources: Promise<UnknownResource>[] = [];
    for (const context of Object.keys(serializedOutput.resources)) {
      promiseToDeserializeResources.push(deserializeResource(context));
    }
    await Promise.all(promiseToDeserializeResources);

    if (freeze) {
      for (const resource of Object.values(seen)) {
        ObjectUtility.deepFreeze(resource);
      }
    }

    return seen;
  }

  /**
   * @internal
   */
  private async serialize(resources: UnknownResource[]): Promise<ResourceSerializedOutput> {
    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};

    for (const resource of resources.sort((a, b) => a.getContext().localeCompare(b.getContext()))) {
      // Skip serializing resources marked as deleted.
      if (resource.isMarkedDeleted()) {
        continue;
      }

      const resourceDependencies = resource
        .getDependencies()
        .map((d) => d.synth())
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      dependencies.push(...resourceDependencies);

      // Take the module and models of a resource this command did not produce from the state it was loaded from.
      const actualResource = this.actualResources.get(resource.getContext());
      const moduleId = this.inputService.getModuleIdFromResource(resource) ?? actualResource?.moduleId;
      if (moduleId === undefined) {
        throw new ResourceError('Resource is not associated with any module!', resource);
      }
      const models = this.inputService.getModelsFromResource(resource);

      serializedResources[resource.getContext()] = {
        className: `${(resource.constructor as typeof AResource).NODE_PACKAGE}/${resource.constructor.name}`,
        kind: resource instanceof ATerraformResource ? 'terraform' : 'external',
        models: models.length > 0 ? models : (actualResource?.models ?? []),
        moduleId,
        resource: resource.synth(),
      };
    }

    return { dependencies, resources: serializedResources };
  }
}

/**
 * @internal
 */
@Factory<ResourceSerializationService>(ResourceSerializationService)
export class ResourceSerializationServiceFactory {
  private static instance: ResourceSerializationService;

  /**
   * @internal
   */
  static async create(): Promise<ResourceSerializationService> {
    const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);
    const inputService = await Container.getInstance().get(InputService);

    if (!this.instance) {
      this.instance = new ResourceSerializationService(resourceDataRepository, inputService);
    }

    return this.instance;
  }
}
