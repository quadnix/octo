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
  type UnknownModel,
  type UnknownResource,
} from '../../src/index.js';

export class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: unknown }, parents: TestResource[]) {
    super(resourceId, properties, parents as AResource<TestResource>[]);
  }
}

export class TestAction {}

export class TestActionFactory {
  static async create(): Promise<TestAction> {
    return new TestAction();
  }
}

export class TestAnchor extends AAnchor {
  constructor(anchorId: string, properties: IAnchor['properties'], parent: UnknownModel) {
    super(anchorId, properties, parent);
  }
}

export class TestAnchorFactory {
  static async create(): Promise<TestAnchor> {
    return new TestAnchor('anchorId', {}, {} as UnknownModel);
  }
}

export class TestModelWithoutUnsynth extends AModel<object, TestModelWithoutUnsynth> {
  readonly MODEL_NAME: string = 'test-model';

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
  readonly MODEL_NAME: string = 'test-overlay';

  constructor(overlayId: IOverlay['overlayId'], properties: IOverlay['properties'], anchors: AAnchor[]) {
    super(overlayId, properties, anchors);
  }
}

export class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: IResource['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}

export class TestResourceWithDiffOverride extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: IResource['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }
}
