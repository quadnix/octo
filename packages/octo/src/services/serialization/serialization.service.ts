import { App } from '../../models/app/app.model';
import { Deployment } from '../../models/deployment/deployment.model';
import { Environment } from '../../models/environment/environment.model';
import { Execution } from '../../models/execution/execution.model';
import { Image } from '../../models/image/image.model';
import { Model } from '../../models/model.abstract';
import { IModel } from '../../models/model.interface';
import { Pipeline } from '../../models/pipeline/pipeline.model';
import { Region } from '../../models/region/region.model';
import { Server } from '../../models/server/server.model';
import { Support } from '../../models/support/support.model';
import { Dependency, IDependency } from '../../functions/dependency/dependency.model';

export type SerializedOutput = {
  dependencies: IDependency[];
  models: { [p: string]: { className: string; model: IModel<unknown, unknown> } };
  version: string;
};

export class SerializationService {
  readonly SERIALIZATION_VERSION = 'v0';

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

  async deserialize(serializedOutput: SerializedOutput): Promise<Model<unknown, unknown>> {
    if (serializedOutput.version !== this.SERIALIZATION_VERSION) {
      throw new Error('Version mismatch on deserialization!');
    }

    const deReferencePromises: { [p: string]: (value: boolean) => void } = {};
    const seen: { [p: string]: Model<unknown, unknown> } = {};

    const deReferenceContext = async (context: string): Promise<Model<unknown, unknown>> => {
      if (!seen[context]) {
        const promise = new Promise<boolean>((resolve) => {
          deReferencePromises[context] = resolve;
        });
        await promise;
      }

      return seen[context];
    };

    for (const d of serializedOutput.dependencies) {
      if (!seen[d.from]) {
        const { className, model } = serializedOutput.models[d.from];
        const deserializationClass = this.classMapping[className];
        this.throwErrorIfDeserializationClassInvalid(deserializationClass);

        seen[d.from] = await deserializationClass.unSynth(model, deReferenceContext);
        if (deReferencePromises[d.from] !== undefined) {
          deReferencePromises[d.from](true);
        }
      }

      if (!seen[d.to]) {
        const { className, model } = serializedOutput.models[d.to];
        const deserializationClass = this.classMapping[className];
        this.throwErrorIfDeserializationClassInvalid(deserializationClass);

        seen[d.to] = await deserializationClass.unSynth(model, deReferenceContext);
        if (deReferencePromises[d.to] !== undefined) {
          deReferencePromises[d.to](true);
        }
      }

      const dependency = Dependency.unSynth(seen[d.from], seen[d.to], d);
      seen[d.from]['dependencies'].push(dependency);
    }

    return seen[serializedOutput.dependencies[0].from];
  }

  registerClass(className: string, deserializationClass: any): void {
    this.throwErrorIfDeserializationClassInvalid(deserializationClass);
    this.classMapping[className] = deserializationClass;
  }

  serialize(root: Model<unknown, unknown>): SerializedOutput {
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

    return { dependencies, models, version: this.SERIALIZATION_VERSION };
  }
}
