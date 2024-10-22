import {
  type IUnknownModel,
  type ModelSerializedOutput,
  NodeType,
  type UnknownModel,
  type UnknownOverlay,
} from '../../../app.type.js';
import { Container } from '../../../functions/container/container.js';
import { EventSource } from '../../../decorators/event-source.decorator.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import {
  AnchorRegistrationEvent,
  ModelDeserializedEvent,
  ModelRegistrationEvent,
  ModelSerializedEvent,
  OverlayRegistrationEvent,
} from '../../../events/index.js';
import { Dependency, type IDependency } from '../../../functions/dependency/dependency.js';
import type { ANode } from '../../../functions/node/node.abstract.js';
import type { AAnchor } from '../../../overlays/anchor.abstract.js';
import type { IAnchor } from '../../../overlays/anchor.interface.js';
import { OverlayDataRepository } from '../../../overlays/overlay-data.repository.js';
import type { IOverlay } from '../../../overlays/overlay.interface.js';
import { ObjectUtility } from '../../../utilities/object/object.utility.js';

export class ModelSerializationService {
  private MODEL_DESERIALIZATION_TIMEOUT_IN_MS = 5000;

  private readonly classMapping: { [key: string]: any } = {};

  private async _deserialize(
    serializedOutput: ModelSerializedOutput,
    freeze: boolean,
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
      seen[context]['context'] = context;

      if (deReferencePromises[context] !== undefined) {
        deReferencePromises[context][1](true);
        clearTimeout(deReferencePromises[context][3]);
      }

      return seen[context];
    };

    // Deserialize all models.
    const promiseToDeserializeModels: Promise<UnknownModel>[] = [];
    for (const context in serializedOutput.models) {
      promiseToDeserializeModels.push(deserializeModel(context));
    }
    await Promise.all(promiseToDeserializeModels);

    // Deserialize all anchors.
    for (const a of serializedOutput.anchors) {
      const { className, parent } = a;
      const deserializationClass = this.classMapping[className];

      const anchor = await deserializationClass.unSynth(deserializationClass, a, deReferenceContext);
      seen[parent.context].addAnchor(anchor);
    }

    // Deserialize all overlays.
    const overlays: UnknownOverlay[] = [];
    for (const { className, overlay } of serializedOutput.overlays) {
      const deserializationClass = this.classMapping[className];
      const newOverlay = await deserializationClass.unSynth(deserializationClass, overlay, deReferenceContext);
      overlays.push(newOverlay);
      seen[newOverlay.getContext()] = newOverlay;
    }

    // Deserialize all dependencies.
    for (const d of serializedOutput.dependencies) {
      const dependency = Dependency.unSynth(seen[d.from], seen[d.to], d);
      if (!seen[d.from].getDependencies().some((d) => d.from === dependency.from && d.to === dependency.to)) {
        seen[d.from]['dependencies'].push(dependency);
      }
    }

    if (freeze) {
      for (const model of Object.values(seen)) {
        ObjectUtility.deepFreeze(model);
      }
      for (const overlay of overlays) {
        ObjectUtility.deepFreeze(overlay);
      }
    }

    // If no dependencies to serialize, return the first seen model.
    const root =
      serializedOutput.dependencies.length > 0
        ? seen[serializedOutput.dependencies[0].from]
        : seen[Object.keys(seen)[0]];

    return { overlays, root };
  }

  @EventSource(ModelDeserializedEvent)
  async deserialize(
    serializedOutput: ModelSerializedOutput,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<UnknownModel> {
    const { overlays: oldOverlays, root } = await this._deserialize(serializedOutput, freeze);

    // Refresh the overlay data repository.
    await Container.getInstance().get(OverlayDataRepository, { args: [true, oldOverlays] });

    return root;
  }

  @EventSource(AnchorRegistrationEvent)
  @EventSource(ModelRegistrationEvent)
  @EventSource(OverlayRegistrationEvent)
  registerClass(className: string, deserializationClass: any): void {
    if (this.classMapping[className]) {
      throw new Error(`Class "${className}" is already registered!`);
    }
    this.classMapping[className] = deserializationClass;
  }

  @EventSource(ModelSerializedEvent)
  async serialize(root: UnknownModel): Promise<ModelSerializedOutput> {
    const boundary = root.getBoundaryMembers();
    const anchors: (IAnchor & { className: string })[] = [];
    const dependencies: IDependency[] = [];
    const models: { [key: string]: { className: string; model: IUnknownModel } } = {};
    const overlays: { className: string; overlay: IOverlay }[] = [];

    for (const model of boundary) {
      for (const d of model.getDependencies()) {
        // Skip dependencies that are not part of boundary.
        if (
          !boundary.some((m) => m.getContext() === d.from.getContext()) ||
          !boundary.some((m) => m.getContext() === d.to.getContext())
        ) {
          continue;
        }

        dependencies.push(d.synth());
      }

      if ((model.constructor as typeof ANode).NODE_TYPE === NodeType.MODEL) {
        const context = model.getContext();
        if (!models[context]) {
          models[context] = {
            className: `${(model.constructor as typeof ANode).NODE_PACKAGE}/${model.constructor.name}`,
            model: model.synth() as IUnknownModel,
          };
        }

        for (const a of (model as UnknownModel).getAnchors()) {
          anchors.push({
            ...a.synth(),
            className: `${(a.constructor as typeof AAnchor).NODE_PACKAGE}/${a.constructor.name}`,
          });
        }
      } else if ((model.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY) {
        overlays.push({
          className: `${(model.constructor as typeof ANode).NODE_PACKAGE}/${model.constructor.name}`,
          overlay: (model as UnknownOverlay).synth(),
        });
      }
    }

    return { anchors, dependencies, models, overlays };
  }

  setModelDeserializationTimeout(timeoutInMs: number): void {
    this.MODEL_DESERIALIZATION_TIMEOUT_IN_MS = timeoutInMs;
  }
}

@Factory<ModelSerializationService>(ModelSerializationService)
export class ModelSerializationServiceFactory {
  private static instance: ModelSerializationService;

  static async create(forceNew = false): Promise<ModelSerializationService> {
    if (!this.instance) {
      this.instance = new ModelSerializationService();
    }
    if (forceNew) {
      const newInstance = new ModelSerializationService();
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
