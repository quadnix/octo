import {
  type AnchorSchema,
  type ModelName,
  type ModelSerializedOutput,
  NodeType,
  type UnknownAnchor,
  type UnknownModel,
  type UnknownNode,
  type UnknownOverlay,
} from '../../../app.type.js';
import { EventSource } from '../../../decorators/event-source.decorator.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { ModelError, NodeUnsynthError, OverlayError } from '../../../errors/index.js';
import {
  AnchorRegistrationEvent,
  ModelDeserializedEvent,
  ModelRegistrationEvent,
  ModelSerializedEvent,
  OverlayRegistrationEvent,
} from '../../../events/index.js';
import { Container } from '../../../functions/container/container.js';
import { Dependency } from '../../../functions/dependency/dependency.js';
import { ANode } from '../../../functions/node/node.abstract.js';
import { ModuleContainer } from '../../../modules/module.container.js';
import { AAnchor } from '../../../overlays/anchor.abstract.js';
import { OverlayDataRepository, type OverlayDataRepositoryFactory } from '../../../overlays/overlay-data.repository.js';
import { UnloadedNodeUtility } from '../../../utilities/unloaded-node/unloaded-node.utility.js';
import { ImportService } from '../../import/import.service.js';
import { InputService } from '../../input/input.service.js';

/**
 * @internal
 */
export class ModelSerializationService {
  private readonly classMapping: { [key: string]: any } = {};

  private readonly MODEL_DESERIALIZATION_TIMEOUT_IN_MS = 3000;

  /**
   * @internal
   */
  constructor(
    private readonly importService: ImportService,
    private readonly inputService: InputService,
    private readonly moduleContainer: ModuleContainer,
  ) {}

  /**
   * @internal
   */
  @EventSource(ModelDeserializedEvent)
  async deserialize(
    serializedOutput: ModelSerializedOutput,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<UnknownModel> {
    const { overlays: oldOverlays, root } = await this._deserialize(serializedOutput, freeze);

    // Refresh the overlay data repository.
    await Container.getInstance().get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      { args: [true, oldOverlays] },
    );

    return root;
  }

  /**
   * Reads other apps' model graphs so this app's modules build on them, unfrozen for a state it
   * extends and frozen for a store. A node it names that `declared` already holds is linked to, never
   * built again; an anchor or a link into a graph neither holds is left out. A class this app does not
   * import is read as a stand-in.
   *
   * @param serializedOutput
   * @param declared The nodes already read, by context.
   * @param freeze
   * @returns Every model and every overlay built, by context.
   */
  async deserializeImported(
    serializedOutput: ModelSerializedOutput,
    { declared = {}, freeze }: { declared?: { [context: string]: UnknownModel | UnknownOverlay }; freeze: boolean },
  ): Promise<{ models: { [context: string]: UnknownModel }; overlays: { [context: string]: UnknownOverlay } }> {
    const { models, overlays } = await this._deserialize(serializedOutput, freeze, { declared });
    return {
      models,
      overlays: Object.fromEntries(serializedOutput.overlays.map(({ context }, i) => [context, overlays[i]])),
    };
  }

  /**
   * @internal
   */
  @EventSource(AnchorRegistrationEvent)
  @EventSource(ModelRegistrationEvent)
  @EventSource(OverlayRegistrationEvent)
  registerClass(className: string, deserializationClass: any): void {
    if (this.classMapping[className]) {
      throw new Error(`Class "${className}" is already registered!`);
    }
    this.classMapping[className] = deserializationClass;
  }

  /**
   * @internal
   */
  @EventSource(ModelSerializedEvent)
  async serialize(root: UnknownModel): Promise<ModelSerializedOutput> {
    // A store's nodes are never saved, so each app's state holds only itself. Its overlays' anchors and
    // links on a store's nodes are, so an app reading this one next to that store restores them.
    const boundary = root.getBoundaryMembers().filter((node) => !this.isStoreNode(node));
    const isInBoundary = (node: UnknownNode): boolean => boundary.some((m) => m.getContext() === node.getContext());
    const anchors: ModelSerializedOutput['anchors'] = [];
    const dependencies: ModelSerializedOutput['dependencies'] = [];
    const models: ModelSerializedOutput['models'] = {};
    const overlays: ModelSerializedOutput['overlays'] = [];

    for (const model of boundary) {
      for (const d of model.getDependencies()) {
        // Skip dependencies that are not part of boundary.
        if (!isInBoundary(d.from) || !(isInBoundary(d.to) || this.isStoreNode(d.to))) {
          continue;
        }

        dependencies.push(d.synth());
      }

      if ((model.constructor as typeof ANode).NODE_TYPE === NodeType.MODEL) {
        const context = model.getContext();
        if (!models[context]) {
          const moduleId = this.inputService.getModuleIdFromModel(model as UnknownModel);
          if (moduleId === undefined) {
            throw new ModelError('Model is not associated with any module!', model as UnknownModel);
          }

          models[context] = {
            className: this.getClassName(model),
            model: model.synth(),
            moduleId,
            nodeName: (model.constructor as typeof ANode).NODE_NAME as ModelName,
          } as ModelSerializedOutput['models'][string];
        }

        for (const a of (model as UnknownModel).getAnchors()) {
          anchors.push({
            ...a.synth(),
            className: this.getClassName(a),
            location: {
              context: model.getContext(),
              type: NodeType.MODEL,
            },
          });
        }
      } else if ((model.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY) {
        const moduleId = this.inputService.getModuleIdFromOverlay(model as UnknownOverlay);
        if (moduleId === undefined) {
          throw new OverlayError('Overlay is not associated with any module!', model as UnknownOverlay);
        }

        overlays.push({
          className: this.getClassName(model),
          context: model.getContext(),
          moduleId,
          overlay: (model as UnknownOverlay).synth(),
        });
      }
    }

    // Validate every anchor an overlay joins is held by a model, since only a model's anchors are serialized.
    const modelAnchorKeys = new Set(anchors.map((a) => [a.parent.context, a.anchorId].join(',')));
    for (const node of boundary) {
      if ((node.constructor as typeof ANode).NODE_TYPE !== NodeType.OVERLAY) {
        continue;
      }

      const overlay = node as UnknownOverlay;
      for (const anchor of overlay.getAnchors().filter((a) => !this.isStoreNode(a.getParent()))) {
        if (!modelAnchorKeys.has([anchor.getParent().getContext(), anchor.anchorId].join(','))) {
          throw new OverlayError('Anchor of overlay is not held by any model!', overlay);
        }
      }
    }

    return {
      anchors,
      dependencies,
      models,
      modules: { ...this.importService.getExtendedModules(), ...this.moduleContainer.getModuleInstances() },
      overlays,
    };
  }

  /**
   * @internal
   */
  private async _deserialize(
    serializedOutput: ModelSerializedOutput,
    freeze: boolean,
    imported?: { declared: { [context: string]: UnknownModel | UnknownOverlay } },
  ): Promise<{ models: { [context: string]: UnknownModel }; overlays: UnknownOverlay[]; root: UnknownModel }> {
    const deReferencePromises: {
      [p: string]: [Promise<boolean>, (value: boolean) => void, (error: Error) => void, NodeJS.Timeout];
    } = {};
    const seen: { [p: string]: UnknownModel } = { ...imported?.declared };

    // Another app saves a link to a store's overlay under the name it read that store by.
    const lookUp = (context: string): UnknownModel | undefined =>
      seen[context] ?? seen[context.replace(/^[\w-]+:/, '')];

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

    // A dependency is restored once both its nodes exist, so a model built later, whose constructor
    // reads its parents' place in the graph, finds them attached.
    const restoreDependencies = (context: string): void => {
      for (const d of serializedOutput.dependencies) {
        const [from, to] = [lookUp(d.from), lookUp(d.to)];
        if ((d.from !== context && d.to !== context) || !from || !to) {
          continue;
        }
        const dependency = Dependency.unSynth(from, to, d);
        if (!from.getDependencies().some((d) => d.from === dependency.from && d.to === dependency.to)) {
          from['dependencies'].push(dependency);
        }
      }
    };

    const deserializeModel = async (context: string): Promise<UnknownModel> => {
      const { className, model, moduleId, nodeName } = serializedOutput.models[context];
      const deserializationClass =
        this.classMapping[className] ?? (imported ? UnloadedNodeUtility.modelClass(className, nodeName) : undefined);
      if (!deserializationClass) {
        throw this.unregisteredClassError(serializedOutput, className, moduleId);
      }

      seen[context] = await deserializationClass.unSynth(model, deReferenceContext);
      seen[context]['context'] = context;
      restoreDependencies(context);

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

    // Deserialize all overlays.
    const overlays: UnknownOverlay[] = [];
    for (const serializedOverlay of serializedOutput.overlays) {
      const { className, context, moduleId, overlay } = serializedOverlay;
      const deserializationClass =
        this.classMapping[className] ??
        (imported
          ? UnloadedNodeUtility.overlayClass(
              className,
              context.slice(context.lastIndexOf('/', context.indexOf('=')) + 1, context.indexOf('=')),
            )
          : undefined);
      if (!deserializationClass) {
        throw this.unregisteredClassError(serializedOutput, className, moduleId);
      }
      const newOverlay = await deserializationClass.unSynth(
        deserializationClass,
        { ...overlay, anchors: [] },
        deReferenceContext,
      );
      newOverlay['context'] = context;
      overlays.push(newOverlay);
      seen[context] = newOverlay;
    }

    // Deserialize all anchors.
    const anchorParentLocationMapping: { [key: string]: UnknownAnchor } = {};
    for (const a of serializedOutput.anchors) {
      const { anchorId, className, location, parent } = a;
      const deserializationClass =
        this.classMapping[className] ?? (imported ? UnloadedNodeUtility.anchorClass(className) : undefined);
      if (!deserializationClass) {
        const moduleId =
          serializedOutput.models[location.context]?.moduleId ??
          serializedOutput.overlays.find((o) => o.context === location.context)!.moduleId;
        throw this.unregisteredClassError(serializedOutput, className, moduleId);
      }

      const anchor = await deserializationClass.unSynth(deserializationClass, a, deReferenceContext);
      seen[location.context].addAnchor(anchor);
      anchorParentLocationMapping[[parent.context, anchorId].join(',')] = anchor;
    }

    // Add overlay anchors. An imported overlay's anchor in a graph not read here is left out.
    for (const [i, { overlay }] of serializedOutput.overlays.entries()) {
      for (const a of overlay.anchors as AnchorSchema<UnknownAnchor>[]) {
        const anchor =
          anchorParentLocationMapping[[a.parent.context, a.anchorId].join(',')] ??
          (imported ? lookUp(a.parent.context)?.getAnchor(a.anchorId) : undefined);
        if (anchor) {
          overlays[i]['anchors'].push(anchor);
        } else if (!imported) {
          throw new NodeUnsynthError('Cannot find anchor while restoring overlay!', overlay.overlayId);
        }
      }
    }

    // Deserialize the dependencies of overlays.
    for (const { context } of serializedOutput.overlays) {
      restoreDependencies(context);
    }

    if (freeze) {
      for (const node of [...Object.keys(serializedOutput.models).map((c) => seen[c]), ...overlays]) {
        this.freezeNode(node);
      }
    }

    // If no dependencies to serialize, return the first seen model.
    const root =
      serializedOutput.dependencies.length > 0
        ? seen[serializedOutput.dependencies[0].from]
        : seen[Object.keys(seen)[0]];

    const models = Object.fromEntries(Object.keys(serializedOutput.models).map((context) => [context, seen[context]]));
    return { models, overlays, root };
  }

  /**
   * Freezes a node and what it holds, never another node it links to, nor another node's anchor.
   */
  private freezeNode(node: UnknownNode): void {
    const freeze = (value: unknown): void => {
      if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return;
      }
      if ((value instanceof ANode && value !== node) || (value instanceof AAnchor && value.getParent() !== node)) {
        return;
      }

      Object.freeze(value);
      Object.values(value).forEach(freeze);
    };
    freeze(node);
  }

  /**
   * The name a node's class is registered and saved under, a stand-in's being the class it stands in for.
   */
  private getClassName(node: UnknownNode | UnknownAnchor): string {
    return (
      UnloadedNodeUtility.getUnloadedClassName(node) ??
      `${(node.constructor as typeof ANode).NODE_PACKAGE}/${node.constructor.name}`
    );
  }

  /**
   * Whether a model or overlay came from a store.
   */
  private isStoreNode(node: UnknownNode): boolean {
    return this.importService.isStoreModule(
      (node.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY
        ? this.inputService.getModuleIdFromOverlay(node as UnknownOverlay)
        : this.inputService.getModuleIdFromModel(node as UnknownModel),
    );
  }

  /**
   * The error for a class the state names that no import has loaded.
   */
  private unregisteredClassError(
    serializedOutput: ModelSerializedOutput,
    className: string,
    moduleId: string,
  ): NodeUnsynthError {
    const moduleClassName = serializedOutput.modules[moduleId]?.className;
    return new NodeUnsynthError(
      `Class "${className}" of module "${moduleId}" is not registered! Import ${moduleClassName ? `"${moduleClassName}"` : 'its module'}, or define a class of that name.`,
      className,
    );
  }
}

/**
 * @internal
 */
@Factory<ModelSerializationService>(ModelSerializationService)
export class ModelSerializationServiceFactory {
  private static instance: ModelSerializationService;

  /**
   * @internal
   */
  static async create(): Promise<ModelSerializationService> {
    const importService = await Container.getInstance().get(ImportService);
    const inputService = await Container.getInstance().get(InputService);
    const moduleContainer = await Container.getInstance().get(ModuleContainer);

    if (!this.instance) {
      this.instance = new ModelSerializationService(importService, inputService, moduleContainer);
    }

    return this.instance;
  }
}
