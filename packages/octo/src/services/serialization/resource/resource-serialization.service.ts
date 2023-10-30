import { Service } from 'typedi';
import { IDependency } from '../../../functions/dependency/dependency.model.js';
import { IActionOutputs } from '../../../models/action.interface.js';
import { AResource } from '../../../resources/resource.abstract.js';
import { IResource } from '../../../resources/resource.interface.js';
import { ASharedResource } from '../../../resources/shared-resource.abstract.js';

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; isSharedResource: boolean; resource: IResource } };
  sharedResources: { [p: string]: { className: string; resourceClassName: string; sharedResource: IResource } };
};

@Service()
export class ResourceSerializationService {
  private readonly classMapping: { [key: string]: any } = {};

  async deserialize(serializedOutput: ResourceSerializedOutput): Promise<IActionOutputs> {
    const deReferencePromises: { [p: string]: [Promise<boolean>, (value: boolean) => void] } = {};
    const parents: { [p: string]: string[] } = {};
    const seen: IActionOutputs = {};

    const deReferenceResource = async (resourceId: string): Promise<AResource<unknown>> => {
      if (!seen[resourceId]) {
        if (deReferencePromises[resourceId]) {
          await deReferencePromises[resourceId][0];
        } else {
          deReferencePromises[resourceId] = [] as any;
          const promise = new Promise<boolean>((resolve) => {
            deReferencePromises[resourceId][1] = resolve;
          });
          deReferencePromises[resourceId][0] = promise;
          await promise;
        }
      }

      return seen[resourceId];
    };

    const deserializeResource = async (resourceId: string, parents: string[]): Promise<AResource<unknown>> => {
      const { className, isSharedResource, resource } = serializedOutput.resources[resourceId];
      const deserializationClass = this.classMapping[className];

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        parents || [],
        deReferenceResource,
      );

      if (isSharedResource) {
        const { className: sharedClassName, sharedResource } = serializedOutput.sharedResources[resourceId];
        for (const key in sharedResource.properties) {
          deserializedResource.properties[key] = sharedResource.properties[key];
        }
        for (const key in sharedResource.response) {
          deserializedResource.response[key] = sharedResource.response[key];
        }

        const deserializationSharedClass = this.classMapping[sharedClassName];

        const deserializedSharedResource = await deserializationSharedClass.unSynth(
          deserializationSharedClass,
          deserializedResource,
        );

        seen[resourceId] = deserializedSharedResource;
        if (deReferencePromises[resourceId]) {
          deReferencePromises[resourceId][1](true);
        }

        return deserializedSharedResource;
      }

      seen[resourceId] = deserializedResource;
      if (deReferencePromises[resourceId]) {
        deReferencePromises[resourceId][1](true);
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
    const promiseToDeserializeResources: Promise<AResource<unknown>>[] = [];
    for (const resourceId in serializedOutput.resources) {
      promiseToDeserializeResources.push(deserializeResource(resourceId, parents[resourceId]));
    }
    await Promise.all(promiseToDeserializeResources);

    // Deserialize all serialized shared-resources.
    for (const resourceId in serializedOutput.sharedResources) {
      // Skip processing resources that are already processed.
      if (seen[resourceId]) {
        continue;
      }

      // Deserialize shared-resources that have no dependencies, and no corresponding resource.
      // Such shared-resource must materialize an empty resource to wrap.
      const { resourceClassName, sharedResource } = serializedOutput.sharedResources[resourceId];
      serializedOutput.resources[sharedResource.resourceId] = {
        className: resourceClassName,
        isSharedResource: true,
        resource: {
          properties: {},
          resourceId: sharedResource.resourceId,
          response: {},
        },
      };
      await deserializeResource(resourceId, []);
    }

    return seen;
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  serialize(resources: AResource<unknown>[]): ResourceSerializedOutput {
    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};
    const sharedSerializedResources: ResourceSerializedOutput['sharedResources'] = {};

    for (const resource of resources) {
      // Skip serializing resources marked as deleted.
      if (resource.isMarkedDeleted()) {
        continue;
      }

      const isSharedResource = resource.MODEL_TYPE === 'shared-resource';

      const resourceDependencies = resource['dependencies'].map((d) => d.synth());
      dependencies.push(...resourceDependencies);

      // Prepare resource, and empty "properties" and "response" objects if they are shared.
      const serializedResource = resource.synth();
      if (isSharedResource) {
        for (const key in serializedResource.properties) {
          if (serializedResource.properties.hasOwnProperty(key)) {
            delete serializedResource.properties[key];
          }
        }
        for (const key in serializedResource.response) {
          if (serializedResource.response.hasOwnProperty(key)) {
            delete serializedResource.response[key];
          }
        }
      }

      serializedResources[resource.resourceId] = {
        className: isSharedResource
          ? (resource as ASharedResource<unknown>).resource.constructor.name
          : resource.constructor.name,
        isSharedResource,
        resource: serializedResource,
      };

      if (isSharedResource) {
        const serializedSharedResource = resource.synth();
        sharedSerializedResources[resource.resourceId] = {
          className: resource.constructor.name,
          resourceClassName: (resource as ASharedResource<unknown>).resource.constructor.name,
          sharedResource: serializedSharedResource,
        };
      }
    }

    return { dependencies, resources: serializedResources, sharedResources: sharedSerializedResources };
  }
}
