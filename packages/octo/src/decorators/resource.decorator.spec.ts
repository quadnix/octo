import { jest } from '@jest/globals';
import { SharedTestResource, TestOverlay, TestResource } from '../../test/helpers/test-classes.js';
import { NodeType } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Resource } from './resource.decorator.js';

describe('Resource UT', () => {
  beforeEach(() => {
    TestContainer.create(
      {
        mocks: [
          {
            type: ResourceSerializationService,
            value: {
              registerClass: jest.fn(),
            },
          },
          {
            type: SharedTestResource,
            value: new SharedTestResource('resourceId', {}, []),
          },
          {
            type: TestResource,
            value: new TestResource('resourceId', {}, []),
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(() => {
    // @ts-expect-error static members are readonly.
    SharedTestResource['NODE_NAME'] = undefined;
    // @ts-expect-error static members are readonly.
    SharedTestResource['NODE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    SharedTestResource['NODE_TYPE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_NAME'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_TYPE'] = undefined;

    Container.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Resource('$$', '$$')(TestResource);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when resourceName is invalid', () => {
    expect(() => {
      Resource('@octo', '$$')(TestResource);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid resource name: $$"`);
  });

  it('should throw error when resource class does not extend AResource or ASharedResource', () => {
    expect(() => {
      Resource('@octo', 'test')(TestOverlay);
    }).toThrowErrorMatchingInlineSnapshot(`"Class "TestOverlay" must extend the AResource or ASharedResource class!"`);
  });

  it('should throw error when registration fails', async () => {
    const resourceSerializationService = await Container.get(ResourceSerializationService);
    jest.spyOn(resourceSerializationService, 'registerClass').mockImplementation(() => {
      throw new Error('error');
    });

    Resource('@octo', 'test')(TestResource);

    await expect(async () => {
      await Container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });

  describe('when a resource is decorated', () => {
    it('should set static members', async () => {
      expect(TestResource.NODE_NAME).toBeUndefined();
      expect(TestResource.NODE_PACKAGE).toBeUndefined();
      expect(TestResource.NODE_TYPE).toBeUndefined();

      Resource('@octo', 'test')(TestResource);

      expect(TestResource.NODE_NAME).toEqual('test');
      expect(TestResource.NODE_PACKAGE).toEqual('@octo');
      expect(TestResource.NODE_TYPE).toEqual(NodeType.RESOURCE);
    });

    it('should register a resource', async () => {
      Resource('@octo', 'test')(TestResource);

      await Container.waitToResolveAllFactories();

      const resourceSerializationService = await Container.get(ResourceSerializationService);
      expect(resourceSerializationService.registerClass).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a shared-resource is decorated', () => {
    it('should set static members', async () => {
      expect(SharedTestResource.NODE_NAME).toBeUndefined();
      expect(SharedTestResource.NODE_PACKAGE).toBeUndefined();
      expect(SharedTestResource.NODE_TYPE).toBeUndefined();

      Resource('@octo', 'test')(SharedTestResource);

      expect(SharedTestResource.NODE_NAME).toEqual('test');
      expect(SharedTestResource.NODE_PACKAGE).toEqual('@octo');
      expect(SharedTestResource.NODE_TYPE).toEqual(NodeType.SHARED_RESOURCE);
    });

    it('should register a shared-resource', async () => {
      Resource('@octo', 'test')(SharedTestResource);

      await Container.waitToResolveAllFactories();

      const resourceSerializationService = await Container.get(ResourceSerializationService);
      expect(resourceSerializationService.registerClass).toHaveBeenCalledTimes(1);
    });
  });
});
