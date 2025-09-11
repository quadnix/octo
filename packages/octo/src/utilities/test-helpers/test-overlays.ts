import { type Constructable, NodeType, type UnknownAnchor, type UnknownOverlay } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from '../../overlays/overlay.schema.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';

function createOverlay(nodeName: string): Constructable<AOverlay<any, any>> {
  return class extends AOverlay<BaseOverlaySchema, any> {
    static override readonly NODE_NAME: string = nodeName;
    static override readonly NODE_PACKAGE: string = '@octo';
    static override readonly NODE_SCHEMA = {};
    static override readonly NODE_TYPE: NodeType = NodeType.OVERLAY;

    constructor(overlayId: string, properties: BaseOverlaySchema['properties'] = {}, anchors: UnknownAnchor[] = []) {
      super(overlayId, properties, anchors);
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
    properties?: { [key: string]: unknown };
  }[],
): Promise<{ [key: string]: UnknownOverlay }> {
  const container = Container.getInstance();
  const [modelSerializationService, overlayDataRepository] = await Promise.all([
    container.get(ModelSerializationService),
    container.get(OverlayDataRepository),
  ]);
  const overlays: { [key: string]: UnknownOverlay } = {};

  return args.reduce(async (accumulator: Promise<{ [key: string]: UnknownOverlay }>, arg) => {
    const { anchors, context, properties } = arg;
    const [overlayMeta, overlayId] = context.split('=');
    const [, NODE_NAME] = overlayMeta.split('/');

    const Overlay = createOverlay(NODE_NAME);
    Object.defineProperty(Overlay, 'name', { value: NODE_NAME });
    const overlay = new Overlay(overlayId, {}, anchors);
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        overlay.properties[key] = value;
      }
    }
    overlayDataRepository.add(overlay);

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
