import { Resource } from '../../../resources/resource.abstract';
import { ResourceSerializationService } from './resource-serialization.service';

class TestResource extends Resource<TestResource> {
  readonly MODEL_NAME: string = 'test-resource';

  constructor(resourceId: string) {
    super(resourceId);
  }
}

describe('Resource Serialization Service UT', () => {
  describe('deserialize()', () => {
    it('should throw error when de-serializing an unknown class', () => {
      const service = new ResourceSerializationService();
      expect(() => {
        service.deserialize({
          dependencies: [],
          resources: {
            'test-resource-1': {
              className: 'TestResource',
              resource: new TestResource('test-resource-1'),
            },
          },
        });
      }).toThrowErrorMatchingInlineSnapshot(`"this.classMapping[className] is not a constructor"`);
    });

    it('should deserialize a known class', () => {
      const resource1 = new TestResource('test-resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response-1'] = 'value1';

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const resources = service.deserialize({
        dependencies: [],
        resources: {
          'test-resource-1': {
            className: 'TestResource',
            resource: resource1.synth(),
          },
        },
      });

      expect(resources).toMatchSnapshot();
    });

    it('should deserialize dependencies', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');

      const service = new ResourceSerializationService();
      service.registerClass('TestResource', TestResource);

      const serializedOutput = service.serialize([resource1, resource2]);
      const resources = service.deserialize(serializedOutput);

      const resource1Deserialized = resources['resource-1'];
      const resource2Deserialized = resource1Deserialized.getChildren()['test-resource'][0]
        .to as Resource<TestResource>;
      expect(resource2Deserialized.resourceId).toBe('resource-2');
    });
  });

  describe('serialize()', () => {
    it('should serialize an empty array', () => {
      const service = new ResourceSerializationService();
      expect(service.serialize([])).toMatchSnapshot();
    });

    it('should serialize non-empty array', () => {
      const resources: Resource<unknown>[] = [new TestResource('resource-1')];

      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });

    it('should serialize dependencies and properties and resources', () => {
      const resource1 = new TestResource('resource-1');
      resource1.properties['key1'] = 'value1';
      resource1.response['response1'] = 'value1';
      const resource2 = new TestResource('resource-2');
      resource2.properties['key2'] = 'value2';
      resource2.response['response2'] = 'value2';
      resource1.addChild('resourceId', resource2, 'resourceId');
      const resources: Resource<unknown>[] = [resource1, resource2];

      const service = new ResourceSerializationService();
      expect(service.serialize(resources)).toMatchSnapshot();
    });
  });
});
