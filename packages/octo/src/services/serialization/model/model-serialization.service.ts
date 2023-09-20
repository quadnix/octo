import { App } from '../../../models/app/app.model';
import { Deployment } from '../../../models/deployment/deployment.model';
import { Environment } from '../../../models/environment/environment.model';
import { Execution } from '../../../models/execution/execution.model';
import { Image } from '../../../models/image/image.model';
import { Model } from '../../../models/model.abstract';
import { IModel } from '../../../models/model.interface';
import { Pipeline } from '../../../models/pipeline/pipeline.model';
import { Region } from '../../../models/region/region.model';
import { Server } from '../../../models/server/server.model';
import { Support } from '../../../models/support/support.model';
import { Dependency, IDependency } from '../../../functions/dependency/dependency.model';

export type ModelSerializedOutput = {
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IModel<unknown, unknown> } };
};

export class ModelSerializationService {
  private readonly classMapping: { [key: string]: any } = {
    App,
    Deployment,
    Environment,
    Execution,
    Image,
    Pipeline,
    Region,
    Server,
    Support,
  };

  private throwErrorIfDeserializationClassInvalid(deserializationClass: any): void {
    const isValid = typeof deserializationClass?.unSynth === 'function';
    if (!isValid) {
      throw new Error('Invalid class, no reference to unSynth static method!');
    }
  }

  async deserialize(serializedOutput: ModelSerializedOutput): Promise<Model<unknown, unknown>> {
    const deReferencePromises: { [p: string]: [Promise<boolean>, (value: boolean) => void] } = {};
    const seen: { [p: string]: Model<unknown, unknown> } = {};

    const deReferenceContext = async (context: string): Promise<Model<unknown, unknown>> => {
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

    const deserializeModel = async (context: string): Promise<Model<unknown, unknown>> => {
      const { className, model } = serializedOutput.models[context];
      const deserializationClass = this.classMapping[className];
      this.throwErrorIfDeserializationClassInvalid(deserializationClass);

      seen[context] = await deserializationClass.unSynth(model, deReferenceContext);
      if (deReferencePromises[context] !== undefined) {
        deReferencePromises[context][1](true);
      }

      return seen[context];
    };

    // Deserialize all serialized models.
    const promiseToDeserializeModels: Promise<Model<unknown, unknown>>[] = [];
    for (const context in serializedOutput.models) {
      promiseToDeserializeModels.push(deserializeModel(context));
    }
    await Promise.all(promiseToDeserializeModels);

    for (const d of serializedOutput.dependencies) {
      const dependency = Dependency.unSynth(seen[d.from], seen[d.to], d);
      seen[d.from]['dependencies'].push(dependency);
    }

    return seen[serializedOutput.dependencies[0].from];
  }

  registerClass(className: string, deserializationClass: any): void {
    this.throwErrorIfDeserializationClassInvalid(deserializationClass);
    this.classMapping[className] = deserializationClass;
  }

  serialize(root: Model<unknown, unknown>): ModelSerializedOutput {
    const boundary = root.getBoundaryMembers();
    const dependencies: IDependency[] = [];
    const models: { [key: string]: { className: string; model: IModel<unknown, unknown> } } = {};

    for (const model of boundary) {
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
          model: model.synth() as IModel<unknown, unknown>,
        };
      }
    }

    return { dependencies, models };
  }
}
