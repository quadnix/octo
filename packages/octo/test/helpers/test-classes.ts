import {
  AAnchor,
  AModel,
  AOverlay,
  AResource,
  ASharedResource,
  type Diff,
  type IAnchor,
  type IOverlay,
  type IResource,
  NodeType,
  type UnknownModel,
  type UnknownResource,
} from '../../src/index.js';

export class SharedTestResource extends ASharedResource<TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_TYPE: NodeType = NodeType.SHARED_RESOURCE;

  constructor(resourceId: string, properties: { [key: string]: unknown }, parents: TestResource[]) {
    super(resourceId, properties, parents as AResource<TestResource>[]);
  }
}

export class TestAction {}

export class TestAnchor extends AAnchor {
  static override readonly NODE_PACKAGE: string = '@octo';

  constructor(anchorId: string, properties: IAnchor['properties'], parent: UnknownModel) {
    super(anchorId, properties, parent);
  }
}

export class TestModelWithoutUnsynth extends AModel<object, TestModelWithoutUnsynth> {
  static override readonly NODE_NAME: string = 'test-model';
  static override readonly NODE_PACKAGE: string = '@octo';
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

export class TestOverlay extends AOverlay<TestOverlay> {
  static override readonly NODE_NAME: string = 'test-overlay';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_TYPE: NodeType = NodeType.OVERLAY;

  constructor(overlayId: IOverlay['overlayId'], properties: IOverlay['properties'], anchors: AAnchor[]) {
    super(overlayId, properties, anchors);
  }
}

export class TestResource extends AResource<TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: IResource['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}

export class TestResourceWithDiffOverride extends AResource<TestResource> {
  static override readonly NODE_NAME: string = 'test-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: IResource['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }
}
