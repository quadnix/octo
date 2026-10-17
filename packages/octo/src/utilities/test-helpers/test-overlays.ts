import {
  type Constructable,
  type IUnknownModelAction,
  NodeType,
  type UnknownAnchor,
  type UnknownModel,
  type UnknownOverlay,
} from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from '../../overlays/anchor.schema.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from '../../overlays/overlay.schema.js';
import { InputService } from '../../services/input/input.service.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';
import { TEST_MODULE_ID } from './test-modules.js';

/**
 * @internal
 */
export function createAnchor(): Constructable<AAnchor<BaseAnchorSchema, UnknownModel>> & {
  setClassName(className: string): Constructable<AAnchor<BaseAnchorSchema, UnknownModel>>;
} {
  return class extends AAnchor<BaseAnchorSchema, UnknownModel> {
    static override readonly NODE_PACKAGE: string = '@octo';

    /**
     * @internal
     */
    constructor(anchorId: string, properties: BaseAnchorSchema['properties'], parent: UnknownModel) {
      super(anchorId, properties, parent);
    }

    /**
     * @internal
     */
    static setClassName(className: string): Constructable<AAnchor<BaseAnchorSchema, UnknownModel>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }
  };
}

/**
 * @internal
 */
export function createOverlay(
  nodeName: string,
): Constructable<AOverlay<any, any>> & { setClassName(className: string): Constructable<AOverlay<any, any>> } {
  return class extends AOverlay<BaseOverlaySchema, any> {
    static override readonly NODE_NAME: string = nodeName;
    static override readonly NODE_PACKAGE: string = '@octo';
    static override readonly NODE_SCHEMA = {};
    static override readonly NODE_TYPE: NodeType = NodeType.OVERLAY;

    /**
     * @internal
     */
    constructor(overlayId: string, properties: BaseOverlaySchema['properties'] = {}, anchors: UnknownAnchor[] = []) {
      super(overlayId, properties, anchors);
    }

    /**
     * @internal
     */
    static setClassName(className: string): Constructable<AOverlay<any, any>> {
      Object.defineProperty(this, 'name', { value: className });
      return this;
    }
  };
}

/**
 * @internal
 */
export async function createTestOverlays(
  args: {
    anchors: UnknownAnchor[];
    context: string;
    overlayActions?: IUnknownModelAction[];
    properties?: { [key: string]: unknown };
  }[],
  { moduleId = TEST_MODULE_ID }: { moduleId?: string } = {},
): Promise<{ [key: string]: UnknownOverlay }> {
  const container = Container.getInstance();
  const [inputService, modelSerializationService, overlayDataRepository, transactionService] = await Promise.all([
    container.get(InputService),
    container.get(ModelSerializationService),
    container.get(OverlayDataRepository),
    container.get(TransactionService),
  ]);
  const overlays: { [key: string]: UnknownOverlay } = {};

  return args.reduce(async (accumulator: Promise<{ [key: string]: UnknownOverlay }>, arg) => {
    const { anchors, context, properties } = arg;
    const [overlayMeta, overlayId] = context.split('=');
    const [, NODE_NAME] = overlayMeta.split('/');

    const Overlay = createOverlay(NODE_NAME).setClassName(NODE_NAME);

    try {
      transactionService.registerOverlayActions(Overlay, arg.overlayActions || []);
    } catch (error) {
      if (!/^Action ".*" already registered for overlay ".*"!$/.test(error.message)) {
        throw error;
      }
    }

    const overlay = new Overlay(overlayId, {}, anchors);
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        overlay.properties[key] = value;
      }
    }
    overlayDataRepository.add(overlay);
    if (inputService.getModuleIdFromOverlay(overlay) === undefined) {
      inputService.registerOverlay(moduleId, overlay);
    }

    const overlayClassName = `${(overlay.constructor as typeof AOverlay).NODE_PACKAGE}/${overlay.constructor.name}`;
    try {
      modelSerializationService.registerClass(overlayClassName, Overlay);
    } catch (error) {
      if (error.message !== `Class "${overlayClassName}" is already registered!`) {
        throw error;
      }
    }

    overlays[context] = overlay;

    return {
      ...(await accumulator),
      [context]: overlay,
    };
  }, Promise.resolve({}));
}
