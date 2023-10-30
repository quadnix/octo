import { AResource } from './resource.abstract.js';

class TestResource extends AResource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

describe('Resource UT', () => {
  describe('associateWith()', () => {
    it('should not be allowed to associate with same resource twice', () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');

      resource1.associateWith([resource2]);

      expect(() => {
        resource1.associateWith([resource2]);
      }).toThrowErrorMatchingInlineSnapshot(`"Resource already associated with!"`);
    });

    it('should be able to associate with another resource as its child', () => {
      const resource1 = new TestResource('resource-1');
      const resource2 = new TestResource('resource-2');

      resource1.associateWith([resource2]);

      expect((resource2.getChildren()['test-resource'][0].to as AResource<TestResource>).resourceId).toBe('resource-1');
    });
  });

  describe('markDeleted()', () => {
    it('should not be able to mark a resource deleted with dependencies', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      expect(() => {
        resource1.markDeleted();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
    });

    it('should be able to mark leaf resources deleted', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      resource2.markDeleted();

      expect(resource1.getChildren()).toMatchInlineSnapshot(`{}`);
      expect(resource2.isMarkedDeleted()).toBe(true);
    });
  });
});
