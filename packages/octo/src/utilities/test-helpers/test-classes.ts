import { NodeType, type UnknownAnchor, type UnknownModel, type UnknownResource } from '../../app.type.js';
import type { Diff } from '../../functions/diff/diff.js';
import { Schema } from '../../functions/schema/schema.js';
import { App } from '../../models/app/app.model.js';
import { AModel } from '../../models/model.abstract.js';
import { AModule } from '../../modules/module.abstract.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from '../../overlays/anchor.schema.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from '../../overlays/overlay.schema.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';

/**
 * @internal
 */
export class TestAction {}

/**
 * @internal
 */
export class TestAnchor extends AAnchor<BaseAnchorSchema, UnknownModel> {
  static override readonly NODE_PACKAGE: string = '@octo';

  constructor(anchorId: string, properties: BaseAnchorSchema['properties'], parent: UnknownModel) {
    super(anchorId, properties, parent);
  }
}

/**
 * @internal
 */
export class TestAppModuleSchema {
  name = Schema<string>();
}

/**
 * @internal
 */
export class TestAppModule extends AModule<TestAppModuleSchema, App> {
  static override readonly MODULE_PACKAGE = '@octo';

  static override readonly MODULE_SCHEMA = TestAppModuleSchema;

  async onInit(inputs: TestAppModuleSchema): Promise<App> {
    return new App(inputs.name);
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

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override setContext(): string {
    return 'test-model=test';
  }

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
export class TestOverlayModuleSchema {
  anchorName = Schema<string>();
  app = Schema<App>();
}

/**
 * @internal
 */
export class TestOverlayModule extends AModule<TestOverlayModuleSchema, TestOverlay> {
  static override readonly MODULE_PACKAGE = '@octo';

  static override readonly MODULE_SCHEMA = TestOverlayModuleSchema;

  async onInit(inputs: TestOverlayModuleSchema): Promise<TestOverlay> {
    const anchor = inputs.app.getAnchor(inputs.anchorName)!;
    return new TestOverlay('test-overlay', {}, [anchor]);
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

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}
