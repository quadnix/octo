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

    for (const d of serializedOutput.dependencies) {
      const fromResourceId = d.from.split('=')[1];
      const toResourceId = d.to.split('=')[1];

      if (!seen[fromResourceId]) {
        const { className, resource } = serializedOutput.resources[fromResourceId];
        const deserializationClass = this.classMapping[className];
        this.throwErrorIfDeserializationClassInvalid(deserializationClass);

        seen[fromResourceId] = await deserializationClass.unSynth(deserializationClass, resource, deReferenceResource);
        if (deReferencePromises[fromResourceId] !== undefined) {
          deReferencePromises[fromResourceId](true);
        }
      }

      if (!seen[toResourceId]) {
        const { className, resource } = serializedOutput.resources[toResourceId];
        const deserializationClass = this.classMapping[className];
        this.throwErrorIfDeserializationClassInvalid(deserializationClass);

        seen[toResourceId] = await deserializationClass.unSynth(deserializationClass, resource, deReferenceResource);
        if (deReferencePromises[toResourceId] !== undefined) {
          deReferencePromises[toResourceId](true);
        }
      }

      const dependency = Dependency.unSynth(seen[fromResourceId], seen[toResourceId], d);
      seen[fromResourceId]['dependencies'].push(dependency);
    }

    return seen;
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
