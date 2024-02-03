import { jest } from '@jest/globals';
import { Diff } from '../functions/diff/diff.model.js';
import { ResourceDataRepository } from './resource-data.repository.js';
import { AResource } from './resource.abstract.js';
import { ASharedResource } from './shared-resource.abstract.js';

class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

class TestResourceWithDiffOverride extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }

  override async diff(): Promise<Diff[]> {
    return [];
  }
}

class SharedTestResource extends ASharedResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string, properties: { [key: string]: unknown }, parents: [TestResource?]) {
    super(resourceId, properties, parents as AResource<TestResource>[]);
  }
}

describe('ResourceDataRepository UT', () => {
  describe('diff()', () => {
    it('should compare resources using resource diff()', async () => {
      const oldResource = new TestResourceWithDiffOverride('resource-1');
      const newResource = new TestResourceWithDiffOverride('resource-1');

      const resourceDataRepository = new ResourceDataRepository([], [oldResource]);
      resourceDataRepository.add(newResource);

      const diffOverrideSpy = jest.spyOn(newResource, 'diff');

      const diffs = await resourceDataRepository.diff();

      expect(diffOverrideSpy).toHaveBeenCalledTimes(1);
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should compare distinct resources', async () => {
      const oldResource = new TestResource('resource-1');
      const newResource = new TestResourceWithDiffOverride('resource-1');

      const resourceDataRepository = new ResourceDataRepository([], [oldResource]);
      resourceDataRepository.add(newResource);

      const diffs = await resourceDataRepository.diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should compare same resources', async () => {
      const oldResource = new TestResource('resource-1');
      const newResource = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([], [oldResource]);
      resourceDataRepository.add(newResource);

      const diffs = await resourceDataRepository.diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should compare same resources with delete marker on latest', async () => {
      const oldResource = new TestResource('resource-1');
      const newResource = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([], [oldResource]);
      resourceDataRepository.add(newResource);
      newResource.markDeleted();

      const diffs = await resourceDataRepository.diff();

      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "resourceId",
            "value": "resource-1",
          },
        ]
      `);
    });

    it('should add resource if not found in old', async () => {
      const newResource = new TestResource('resource-1');

      const resourceDataRepository = new ResourceDataRepository([], []);
      resourceDataRepository.add(newResource);

      const diffs = await resourceDataRepository.diff();

      expect(diffs).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "resourceId",
            "value": "resource-1",
          },
        ]
      `);
    });

    it('should skip adding shared-resource if it already exists', async () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');
      const sharedResource1 = new SharedTestResource('shared-test-resource', {}, [resource1]);
      const sharedResource2 = new SharedTestResource('shared-test-resource', {}, [resource2]);

      const resourceDataRepository = new ResourceDataRepository(
        [resource1, resource2, sharedResource1],
        [resource1, resource2, sharedResource1],
      );
      resourceDataRepository.add(sharedResource2);

      const diffs = await resourceDataRepository.diff();

      expect(diffs).toMatchInlineSnapshot(`[]`);
    });
  });
});
