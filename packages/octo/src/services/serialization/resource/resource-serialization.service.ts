import { Dependency, IDependency } from '../../../functions/dependency/dependency.model';
import { IActionOutputs } from '../../../models/action.interface';
import { Resource } from '../../../resources/resource.abstract';
import { IResource } from '../../../resources/resource.interface';
import { SharedResource } from '../../../resources/shared-resource.abstract';

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; isSharedResource: boolean; resource: IResource } };
  sharedResources: { [p: string]: { className: string; resource: IResource } };
};

export class ResourceSerializationService {
  private readonly classMapping: { [key: string]: any } = {};

  private throwErrorIfDeserializationClassInvalid(deserializationClass: any): void {
    const isValid = typeof deserializationClass?.unSynth === 'function';
    if (!isValid) {
      throw new Error('Invalid class, no reference to unSynth static method!');
    }
  }

  async deserialize(serializedOutput: ResourceSerializedOutput): Promise<IActionOutputs> {
    const deReferencePromises: { [p: string]: (value: boolean) => void } = {};
    const seen: IActionOutputs = {};

    const deReferenceResource = async (resourceId: string): Promise<Resource<unknown>> => {
      if (!seen[resourceId]) {
        const promise = new Promise<boolean>((resolve) => {
          deReferencePromises[resourceId] = resolve;
        });
        await promise;
      }

      return seen[resourceId];
    };

    const deserializeResource = async (resourceId: string): Promise<Resource<unknown>> => {
      const { className, isSharedResource, resource } = serializedOutput.resources[resourceId];
      const deserializationClass = this.classMapping[className];
      this.throwErrorIfDeserializationClassInvalid(deserializationClass);

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        deReferenceResource,
      );

      if (isSharedResource) {
        const { className: sharedClassName, resource: sharedResource } = serializedOutput.sharedResources[resourceId];
        for (const key in sharedResource.properties) {
          deserializedResource.properties[key] = sharedResource.properties[key];
        }
        for (const key in sharedResource.response) {
          deserializedResource.response[key] = sharedResource.response[key];
        }

        const deserializationSharedClass = this.classMapping[sharedClassName];
        this.throwErrorIfDeserializationClassInvalid(deserializationSharedClass);

        return deserializationSharedClass.unSynth(deserializationSharedClass, deserializedResource);
      }

      return deserializedResource;
    };

    // Generate a cache of resources with dependencies.
    for (const d of serializedOutput.dependencies) {
      const fromResourceId = d.from.split('=')[1];
      const toResourceId = d.to.split('=')[1];

      if (!seen[fromResourceId]) {
        seen[fromResourceId] = await deserializeResource(fromResourceId);
        if (deReferencePromises[fromResourceId] !== undefined) {
          deReferencePromises[fromResourceId](true);
        }
      }

      if (!seen[toResourceId]) {
        seen[toResourceId] = await deserializeResource(toResourceId);
        if (deReferencePromises[toResourceId] !== undefined) {
          deReferencePromises[toResourceId](true);
        }
      }

      const dependency = Dependency.unSynth(seen[fromResourceId], seen[toResourceId], d);
      seen[fromResourceId]['dependencies'].push(dependency);
    }

    // Deserialize all serialized resources.
    const resources: IActionOutputs = {};
    for (const resourceId in serializedOutput.resources) {
      if (seen[resourceId]) {
        resources[resourceId] = seen[resourceId];
        continue;
      }

      // Initialize resources/shared-resources that have no dependencies.
      resources[resourceId] = await deserializeResource(resourceId);
    }

    return resources;
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  serialize(resources: Resource<unknown>[]): ResourceSerializedOutput {
    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};
    const sharedSerializedResources: ResourceSerializedOutput['sharedResources'] = {};

    for (const resource of resources) {
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
          ? (resource as SharedResource<unknown>).resource.constructor.name
          : resource.constructor.name,
        isSharedResource,
        resource: serializedResource,
      };

      if (isSharedResource) {
        // Prepare shared resource, and empty "parents" array since it is resource specific (un-shared).
        const serializedSharedResource = resource.synth();
        while (serializedSharedResource.parents.length > 0) serializedSharedResource.parents.pop();

        sharedSerializedResources[resource.resourceId] = {
          className: resource.constructor.name,
          resource: serializedSharedResource,
        };
      }
    }

    return { dependencies, resources: serializedResources, sharedResources: sharedSerializedResources };
  }
}
