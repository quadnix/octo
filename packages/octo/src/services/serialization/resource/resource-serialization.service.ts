import { Dependency, IDependency } from '../../../functions/dependency/dependency.model';
import { IActionOutputs } from '../../../models/action.interface';
import { Resource } from '../../../resources/resource.abstract';
import { IResource } from '../../../resources/resource.interface';

export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: { [p: string]: { className: string; resource: IResource } };
};

export class ResourceSerializationService {
  private readonly classMapping: { [key: string]: any } = {};

  deserialize(serializedOutput: ResourceSerializedOutput): IActionOutputs {
    const resources: IActionOutputs = {};

    // UnSynth resources.
    for (const resourceId in serializedOutput.resources) {
      const { className, resource } = serializedOutput.resources[resourceId];

      const resourceObject: Resource<unknown> = new this.classMapping[className](resource.resourceId);
      resourceObject.unSynth(resource);

      resources[resource.resourceId] = resourceObject;
    }

    // UnSynth resource dependencies.
    for (const d of serializedOutput.dependencies) {
      const fromResourceId = d.from.split('=')[1];
      const toResourceId = d.to.split('=')[1];
      const dependency = Dependency.unSynth(resources[fromResourceId], resources[toResourceId], d);
      resources[fromResourceId]['dependencies'].push(dependency);
    }

    return resources;
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  serialize(resources: Resource<unknown>[]): ResourceSerializedOutput {
    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};

    for (const resource of resources) {
      const resourceDependencies = resource['dependencies'].map((d) => d.synth());
      dependencies.push(...resourceDependencies);

      serializedResources[resource.resourceId] = {
        className: resource.constructor.name,
        resource: resource.synth(),
      };
    }

    return { dependencies, resources: serializedResources };
  }
}
