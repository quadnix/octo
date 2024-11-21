import { NodeType, type UnknownAnchor, type UnknownModel, type UnknownResource } from '../../src/app.type.js';
import {
  AAnchor,
  AOverlay,
  AResource,
  ASharedResource,
  type BaseAnchorSchema,
  type BaseOverlaySchema,
  type BaseResourceSchema,
  type Diff,
} from '../../src/index.js';
import { AModel } from '../../src/models/model.abstract.js';

export class SharedTestResource extends ASharedResource<BaseResourceSchema, TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.SHARED_RESOURCE;

  constructor(resourceId: string, properties: { [key: string]: unknown }, parents: TestResource[]) {
    super(resourceId, properties, parents as AResource<BaseResourceSchema, TestResource>[]);
  }
}

export class TestAction {}

export class TestAnchor extends AAnchor<BaseAnchorSchema, UnknownModel> {
  static override readonly NODE_PACKAGE: string = '@octo';

  constructor(anchorId: string, properties: BaseAnchorSchema['properties'], parent: UnknownModel) {
    super(anchorId, properties, parent);
  }
}

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

export class TestResource extends AResource<BaseResourceSchema, TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}

export class TestResourceWithDiffOverride extends AResource<BaseResourceSchema, TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }
}
