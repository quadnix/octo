import type { IUnknownModel, ModelSerializedOutput, UnknownModel, UnknownOverlay } from '../../../app.type.js';
import { Container } from '../../../decorators/container.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import type { IAnchor } from '../../../overlays/anchor.interface.js';
import { Dependency } from '../../../functions/dependency/dependency.js';
import type { IDependency } from '../../../functions/dependency/dependency.js';
import type { IOverlay } from '../../../overlays/overlay.interface.js';
import { OverlayDataRepository } from '../../../overlays/overlay-data.repository.js';

export class ModelSerializationService {
  private MODEL_DESERIALIZATION_TIMEOUT_IN_MS = 5000;

  private readonly classMapping: { [key: string]: any } = {};

  constructor(private readonly overlayDataRepository: OverlayDataRepository) {}

  async _deserialize(
    serializedOutput: ModelSerializedOutput,
  ): Promise<{ overlays: UnknownOverlay[]; root: UnknownModel }> {
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
    const overlays: UnknownOverlay[] = [];
    for (const { className, overlay } of serializedOutput.overlays) {
      const deserializationClass = this.classMapping[className];
      const newOverlay = await deserializationClass.unSynth(deserializationClass, overlay, deReferenceContext);
      overlays.push(newOverlay);
    }

    // If no dependencies to serialize, return the first seen model.
    const root =
      serializedOutput.dependencies.length > 0
        ? seen[serializedOutput.dependencies[0].from]
        : seen[Object.keys(seen)[0]];

    return { overlays, root };
  }

  async deserialize(serializedOutput: ModelSerializedOutput): Promise<UnknownModel> {
    const { overlays: newOverlays, root } = await this._deserialize(serializedOutput);
    const { overlays: oldOverlays } = await this._deserialize(serializedOutput);

    // Refresh the overlay data repository.
    await Container.get(OverlayDataRepository, {
      args: [true, oldOverlays, newOverlays],
    });

    return root;
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

    for (const overlay of this.overlayDataRepository.getByProperties()) {
      overlays.push({ className: overlay.constructor.name, overlay: overlay.synth() });
    }

    return { anchors, dependencies, models, overlays };
  }
}

@Factory<ModelSerializationService>(ModelSerializationService)
export class ModelSerializationServiceFactory {
  private static instance: ModelSerializationService;

  static async create(forceNew = false): Promise<ModelSerializationService> {
    const overlayDataRepository = await Container.get(OverlayDataRepository);
    if (!this.instance) {
      this.instance = new ModelSerializationService(overlayDataRepository);
    }
    if (forceNew) {
      const newInstance = new ModelSerializationService(overlayDataRepository);
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
