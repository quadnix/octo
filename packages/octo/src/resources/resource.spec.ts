import { Resource } from './resource.abstract';

class TestResource extends Resource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId, {}, []);
  }
}

describe('Resource UT', () => {
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
