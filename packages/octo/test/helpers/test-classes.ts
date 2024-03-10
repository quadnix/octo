import { AAnchor, AOverlay, AResource, ASharedResource, IOverlay, UnknownModel } from '../../src/index.js';

export class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: unknown }, parents: [TestResource?]) {
    super(resourceId, properties, parents as AResource<TestResource>[]);
  }
}

export class TestAnchor extends AAnchor {
  constructor(anchorId: string, parent: UnknownModel) {
    super(anchorId, parent);
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

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}
