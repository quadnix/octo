import { ActionOutputs, ResourceSerializedOutput, UnknownResource } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { IDependency } from '../../../functions/dependency/dependency.model.js';
import { ResourceDataRepository } from '../../../resources/resource-data.repository.js';

export class ResourceSerializationService {
  private RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS = 5000;

  private readonly classMapping: { [key: string]: any } = {};

  private async _deserialize(serializedOutput: ResourceSerializedOutput): Promise<ActionOutputs> {
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
      const { className, resource } = isSharedResource
        ? serializedOutput.sharedResources[resourceId]
        : serializedOutput.resources[resourceId];
      const deserializationClass = this.classMapping[className];

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        parents || [],
        deReferenceResource,
      );

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

    return seen;
  }

  async deserialize(serializedOutput: ResourceSerializedOutput): Promise<void> {
    const deserializedOutput = await this._deserialize(serializedOutput);
    const deserializedOutputCopy = await this._deserialize(serializedOutput);

    // Initialize a new instance of ResourceDataRepository, overwriting the previous one.
    await Container.get(ResourceDataRepository, {
      args: [true, Object.values(deserializedOutput), Object.values(deserializedOutputCopy)],
    });
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  async serialize(): Promise<ResourceSerializedOutput> {
    const resourceDataRepository = await Container.get(ResourceDataRepository);
    const resources = resourceDataRepository.getByProperties();

    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};
    const sharedSerializedResources: ResourceSerializedOutput['sharedResources'] = {};

    for (const resource of resources) {
      // Skip serializing resources marked as deleted.
      if (resource.isMarkedDeleted()) {
        continue;
      }

      const resourceDependencies = resource['dependencies'].map((d) => d.synth());
      dependencies.push(...resourceDependencies);

      if (resource.MODEL_TYPE === 'shared-resource') {
        sharedSerializedResources[resource.resourceId] = {
          className: resource.constructor.name,
          resource: resource.synth(),
        };
      } else {
        serializedResources[resource.resourceId] = {
          className: resource.constructor.name,
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

  static async create(): Promise<ResourceSerializationService> {
    if (!this.instance) {
      this.instance = new ResourceSerializationService();
    }
    return this.instance;
  }
}
