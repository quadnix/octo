import type { ActionOutputs, ResourceSerializedOutput, UnknownResource } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { EventSource } from '../../../decorators/event-source.decorator.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { ResourceRegistrationEvent } from '../../../events/registration.event.js';
import type { IDependency } from '../../../functions/dependency/dependency.js';
import { ResourceDataRepository } from '../../../resources/resource-data.repository.js';
import { ObjectUtility } from '../../../utilities/object/object.utility.js';

export class ResourceSerializationService {
  private RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS = 5000;

  private readonly classMapping: { [key: string]: any } = {};

  constructor(private readonly resourceDataRepository: ResourceDataRepository) {}

  private async _deserialize(serializedOutput: ResourceSerializedOutput, freeze: boolean): Promise<ActionOutputs> {
    const deReferencePromises: {
      [p: string]: [Promise<boolean>, (value: boolean) => void, (error: Error) => void, NodeJS.Timeout];
    } = {};
    const parents: { [p: string]: string[] } = {};
    const seen: ActionOutputs = {};

    const deReferenceResource = async (resourceId: string): Promise<UnknownResource> => {
      if (!seen[resourceId]) {
        if (deReferencePromises[resourceId]) {
          await deReferencePromises[resourceId][0];
        } else {
          deReferencePromises[resourceId] = [] as any;
          const promise = new Promise<boolean>((resolve, reject) => {
            deReferencePromises[resourceId][1] = resolve;
            deReferencePromises[resourceId][2] = reject;
          });
          deReferencePromises[resourceId][0] = promise;

          deReferencePromises[resourceId][3] = setTimeout(() => {
            deReferencePromises[resourceId][2](new Error('DeReferencing resource operation timed out!'));
          }, this.RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS);
          await promise;
        }
      }

      return seen[resourceId];
    };

    const deserializeResource = async (
      resourceId: string,
      parents: string[],
      isSharedResource: boolean,
    ): Promise<UnknownResource> => {
      const { className, context, resource } = isSharedResource
        ? serializedOutput.sharedResources[resourceId]
        : serializedOutput.resources[resourceId];
      const deserializationClass = this.classMapping[className];

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        parents || [],
        deReferenceResource,
      );
      deserializedResource['context'] = context;

      seen[resourceId] = deserializedResource;
      if (deReferencePromises[resourceId]) {
        deReferencePromises[resourceId][1](true);
        clearTimeout(deReferencePromises[resourceId][3]);
      }

      return deserializedResource;
    };

    // Re-generate resource parents from dependencies.
    for (const d of serializedOutput.dependencies) {
      const fromResourceId = d.from.split('=')[1];
      const toResourceId = d.to.split('=')[1];

      if (!parents[fromResourceId]) {
        parents[fromResourceId] = [];
      }
      if (!parents[toResourceId]) {
        parents[toResourceId] = [];
      }

      // Resources don't have other relationships than parent-child relations.
      if (d.relationship?.type === 'child' && !parents[fromResourceId].includes(toResourceId)) {
        parents[fromResourceId].push(toResourceId);
      } else if (d.relationship?.type === 'parent' && !parents[toResourceId].includes(fromResourceId)) {
        parents[toResourceId].push(fromResourceId);
      }
    }

    // Deserialize all serialized resources.
    const promiseToDeserializeResources: Promise<UnknownResource>[] = [];
    for (const resourceId in serializedOutput.resources) {
      promiseToDeserializeResources.push(deserializeResource(resourceId, parents[resourceId], false));
    }
    await Promise.all(promiseToDeserializeResources);

    // Deserialize all serialized shared-resources.
    const promiseToDeserializeSharedResources: Promise<UnknownResource>[] = [];
    for (const resourceId in serializedOutput.sharedResources) {
      promiseToDeserializeSharedResources.push(deserializeResource(resourceId, parents[resourceId], true));
    }
    await Promise.all(promiseToDeserializeSharedResources);

    if (freeze) {
      for (const resource of Object.values(seen)) {
        ObjectUtility.deepFreeze(resource);
      }
    }

    return seen;
  }

  async deserialize(
    serializedOutput: ResourceSerializedOutput,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<void> {
    // Note 1: Unlike overlays, resources needs to be deserialized twice, once for new resources
    // and once for old resources. Resources are generated as a product of model and overlay diff.
    // The user repository code, when runs with a previous state, model and overlay diff won't generate new resources.
    // That equates to ResourceDataRepository being empty.
    // On resource diff with the previous resource, DELETE diffs will be produced.
    // Therefore, it's necessary to load the ResourceDataRepository with new before deserializing the resources.
    // Note 2: Post commit you can still reference the running overlays, but any resource manipulation should be done
    // on after fetching the resource from the ResourceDataRepository. Never use the running resources because
    // post commit they are replaced by a new copy.
    const newResources = await this._deserialize(JSON.parse(JSON.stringify(serializedOutput)), false);
    const oldResources = await this._deserialize(JSON.parse(JSON.stringify(serializedOutput)), freeze);

    // Refresh the resource data repository.
    await Container.get(ResourceDataRepository, {
      args: [true, Object.values(oldResources), Object.values(newResources)],
    });
  }

  @EventSource(ResourceRegistrationEvent)
  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  async serialize(): Promise<ResourceSerializedOutput> {
    const resources = this.resourceDataRepository.getByProperties();

    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};
    const sharedSerializedResources: ResourceSerializedOutput['sharedResources'] = {};

    for (const resource of resources) {
      // Skip serializing resources marked as deleted.
      if (resource.isMarkedDeleted()) {
        this.resourceDataRepository.remove(resource);

        continue;
      }

      const resourceDependencies = resource.getDependencies().map((d) => d.synth());
      dependencies.push(...resourceDependencies);

      if (resource.MODEL_TYPE === 'shared-resource') {
        sharedSerializedResources[resource.resourceId] = {
          className: resource.constructor.name,
          context: resource.getContext(),
          resource: resource.synth(),
        };
      } else {
        serializedResources[resource.resourceId] = {
          className: resource.constructor.name,
          context: resource.getContext(),
          resource: resource.synth(),
        };
      }
    }

    return { dependencies, resources: serializedResources, sharedResources: sharedSerializedResources };
  }

  setResourceDeserializationTimeout(timeoutInMs: number): void {
    this.RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS = timeoutInMs;
  }
}

@Factory<ResourceSerializationService>(ResourceSerializationService)
export class ResourceSerializationServiceFactory {
  private static instance: ResourceSerializationService;

  static async create(forceNew = false): Promise<ResourceSerializationService> {
    const resourceDataRepository = await Container.get(ResourceDataRepository);
    if (!this.instance) {
      this.instance = new ResourceSerializationService(resourceDataRepository);
    }
    if (forceNew) {
      const newInstance = new ResourceSerializationService(resourceDataRepository);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
