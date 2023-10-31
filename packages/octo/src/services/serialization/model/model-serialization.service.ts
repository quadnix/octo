import { Service } from 'typedi';
import { IUnknownModel, ModelSerializedOutput, UnknownModel } from '../../../app.type.js';
import { AModule } from '../../../functions/module/module.abstract.js';
import { IModule } from '../../../functions/module/module.interface.js';
import { IAnchor } from '../../../functions/overlay/anchor.interface.js';
import { Dependency, IDependency } from '../../../functions/dependency/dependency.model.js';

@Service()
export class ModelSerializationService {
  private readonly classMapping: { [key: string]: any } = {};

  private readonly modules: AModule[] = [];

  async deserialize(serializedOutput: ModelSerializedOutput): Promise<UnknownModel> {
    const deReferencePromises: { [p: string]: [Promise<boolean>, (value: boolean) => void] } = {};
    const seen: { [p: string]: UnknownModel } = {};

    const deReferenceContext = async (context: string): Promise<UnknownModel> => {
      if (!seen[context]) {
        if (deReferencePromises[context]) {
          await deReferencePromises[context][0];
        } else {
          deReferencePromises[context] = [] as any;
          const promise = new Promise<boolean>((resolve) => {
            deReferencePromises[context][1] = resolve;
          });
          deReferencePromises[context][0] = promise;
          await promise;
        }
      }

      return seen[context];
    };

    const deserializeModel = async (context: string): Promise<UnknownModel> => {
      const { className, model } = serializedOutput.models[context];
      const deserializationClass = this.classMapping[className];

      seen[context] = await deserializationClass.unSynth(model, deReferenceContext);
      if (deReferencePromises[context] !== undefined) {
        deReferencePromises[context][1](true);
      }

      return seen[context];
    };

    // Deserialize all serialized models.
    const promiseToDeserializeModels: Promise<UnknownModel>[] = [];
    for (const context in serializedOutput.models) {
      promiseToDeserializeModels.push(deserializeModel(context));
    }
    await Promise.all(promiseToDeserializeModels);

    for (const a of serializedOutput.anchors) {
      const { className, parent } = a;
      const deserializationClass = this.classMapping[className];

      const anchor = await deserializationClass.unSynth(a, deReferenceContext);
      seen[parent]['anchors'].push(anchor);
    }

    for (const d of serializedOutput.dependencies) {
      const dependency = Dependency.unSynth(seen[d.from], seen[d.to], d);
      if (!seen[d.from]['dependencies'].some((d) => d.from === dependency.from && d.to === dependency.to)) {
        seen[d.from]['dependencies'].push(dependency);
      }
    }

    // Deserialize all modules.
    this.modules.splice(0, this.modules.length); // Empty modules array.
    for (const { className, module } of serializedOutput.modules) {
      const deserializationClass = this.classMapping[className];

      const newModule = await deserializationClass.unSynth(deserializationClass, module, deReferenceContext);
      this.modules.push(newModule);
    }

    return seen[serializedOutput.dependencies[0].from];
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  registerModule(module: AModule): void {
    this.modules.push(module);
  }

  serialize(root: UnknownModel): ModelSerializedOutput {
    const boundary = root.getBoundaryMembers();
    const anchors: (IAnchor & { className: string })[] = [];
    const dependencies: IDependency[] = [];
    const models: { [key: string]: { className: string; model: IUnknownModel } } = {};
    const modules: { className: string; module: IModule }[] = [];

    for (const model of boundary) {
      for (const a of model['anchors']) {
        anchors.push({ ...a.synth(), className: a.constructor.name });
      }

      for (const d of model['dependencies']) {
        // Skip dependencies that are not part of boundary.
        if (
          !boundary.some((m) => m.getContext() === d.from.getContext()) ||
          !boundary.some((m) => m.getContext() === d.to.getContext())
        ) {
          continue;
        }

        dependencies.push(d.synth());
      }

      const context = model.getContext();
      if (!models[context]) {
        models[context] = {
          className: model.constructor.name,
          model: model.synth() as IUnknownModel,
        };
      }
    }

    for (const module of this.modules) {
      modules.push({ className: module.constructor.name, module: module.synth() });
    }

    return { anchors, dependencies, models, modules };
  }
}
