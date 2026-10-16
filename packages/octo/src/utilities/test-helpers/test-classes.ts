import { NodeType, type UnknownAnchor, type UnknownModel, type UnknownResource } from '../../app.type.js';
import type { Diff } from '../../functions/diff/diff.js';
import { ANodeAction } from '../../functions/node/node-action.abstract.js';
import { AModel } from '../../models/model.abstract.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from '../../overlays/anchor.schema.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from '../../overlays/overlay.schema.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';

/**
 * @internal
 */
export class TestAction {}

/**
 * A resource action handling every diff with `handle`.
 *
 * @internal
 */
export class TestResourceAction extends ANodeAction implements IResourceAction<UnknownResource> {
  /**
   * @internal
   */
  constructor(
    readonly handle: IResourceAction<UnknownResource>['handle'] = async (): Promise<void> => {},
    readonly actionTimeoutInMs?: number,
  ) {
    super();
  }

  /**
   * @internal
   */
  filter(): boolean {
    return true;
  }
}

/**
 * @internal
 */
export class TestAnchor extends AAnchor<BaseAnchorSchema, UnknownModel> {
  static override readonly NODE_PACKAGE: string = '@octo';

  /**
   * @internal
   */
  constructor(anchorId: string, properties: BaseAnchorSchema['properties'], parent: UnknownModel) {
    super(anchorId, properties, parent);
  }
}

/**
 * @internal
 */
export class TestModelWithoutUnsynth extends AModel<object, TestModelWithoutUnsynth> {
  static override readonly NODE_NAME: string = 'test-model';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.MODEL;

  /**
   * @internal
   */
  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  /**
   * @internal
   */
  override setContext(): string {
    return 'test-model=test';
  }

  /**
   * @internal
   */
  override synth(): object {
    return {};
  }
}

/**
 * @internal
 */
export class TestOverlay extends AOverlay<BaseOverlaySchema, TestOverlay> {
  static override readonly NODE_NAME: string = 'test-overlay';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.OVERLAY;

  /**
   * @internal
   */
  constructor(
    overlayId: BaseOverlaySchema['overlayId'],
    properties: BaseOverlaySchema['properties'],
    anchors: UnknownAnchor[],
  ) {
    super(overlayId, properties, anchors);
  }
}

/**
 * @internal
 */
export class TestResource extends AResource<BaseResourceSchema, TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  /**
   * @internal
   */
  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}
