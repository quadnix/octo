import { IUnknownModel, ModelSerializedOutput, UnknownModel, UnknownOverlay } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { IAnchor } from '../../../overlays/anchor.interface.js';
import { Dependency, IDependency } from '../../../functions/dependency/dependency.js';
import { IOverlay } from '../../../overlays/overlay.interface.js';
import { OverlayDataRepository } from '../../../overlays/overlay-data.repository.js';

export class ModelSerializationService {
  private MODEL_DESERIALIZATION_TIMEOUT_IN_MS = 5000;

  private readonly classMapping: { [key: string]: any } = {};

  async deserialize(serializedOutput: ModelSerializedOutput): Promise<UnknownModel> {
    const deReferencePromises: {
      [p: string]: [Promise<boolean>, (value: boolean) => void, (error: Error) => void, NodeJS.Timeout];
    } = {};
    const seen: { [p: string]: UnknownModel } = {};

    const deReferenceContext = async (context: string): Promise<UnknownModel> => {
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
            deReferencePromises[context][2](new Error('DeReferencing model operation timed out!'));
          }, this.MODEL_DESERIALIZATION_TIMEOUT_IN_MS);
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
        clearTimeout(deReferencePromises[context][3]);
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

      const anchor = await deserializationClass.unSynth(deserializationClass, a, deReferenceContext);
      seen[parent.context]['anchors'].push(anchor);
    }

    for (const d of serializedOutput.dependencies) {
      const dependency = Dependency.unSynth(seen[d.from], seen[d.to], d);
      if (!seen[d.from]['dependencies'].some((d) => d.from === dependency.from && d.to === dependency.to)) {
        seen[d.from]['dependencies'].push(dependency);
      }
    }

    // Deserialize all overlays.
    const newOverlays: UnknownOverlay[] = [];
    const oldOverlays: UnknownOverlay[] = [];
    for (const { className, overlay } of serializedOutput.overlays) {
      const deserializationClass = this.classMapping[className];
      const newOverlay = await deserializationClass.unSynth(deserializationClass, overlay, deReferenceContext);
      newOverlays.push(newOverlay);
      const oldOverlay = await deserializationClass.unSynth(deserializationClass, overlay, deReferenceContext);
      oldOverlays.push(oldOverlay);
    }
    // Initialize a new instance of OverlayDataRepository, overwriting the previous one.
    await Container.get(OverlayDataRepository, { args: [true, newOverlays, oldOverlays] });

    // If no dependencies to serialize, return the first seen model.
    return serializedOutput.dependencies.length > 0 ? seen[serializedOutput.dependencies[0].from] : seen[0];
  }

  registerClass(className: string, deserializationClass: any): void {
    this.classMapping[className] = deserializationClass;
  }

  async serialize(root: UnknownModel): Promise<ModelSerializedOutput> {
    const boundary = root.getBoundaryMembers();
    const anchors: (IAnchor & { className: string })[] = [];
    const dependencies: IDependency[] = [];
    const models: { [key: string]: { className: string; model: IUnknownModel } } = {};
    const overlays: { className: string; overlay: IOverlay }[] = [];

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

    const overlayDataRepository = await Container.get(OverlayDataRepository);
    for (const overlay of overlayDataRepository.getByProperties()) {
      overlays.push({ className: overlay.constructor.name, overlay: overlay.synth() });
    }

    return { anchors, dependencies, models, overlays };
  }
}

@Factory<ModelSerializationService>(ModelSerializationService)
export class ModelSerializationServiceFactory {
  private static instance: ModelSerializationService;

  static async create(): Promise<ModelSerializationService> {
    if (!this.instance) {
      this.instance = new ModelSerializationService();
    }
    return this.instance;
  }
}
