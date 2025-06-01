import { jest } from '@jest/globals';
import { NodeType } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { TestOverlay, TestResource } from '../utilities/test-helpers/test-classes.js';
import { Resource } from './resource.decorator.js';

class TestResourceSchema extends BaseResourceSchema {}

describe('Resource UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            type: ResourceSerializationService,
            value: {
              registerClass: jest.fn(),
            },
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

  afterEach(async () => {
    // @ts-expect-error static members are readonly.
    TestResource['NODE_NAME'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_PACKAGE'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_SCHEMA'] = undefined;
    // @ts-expect-error static members are readonly.
    TestResource['NODE_TYPE'] = undefined;

    await TestContainer.reset();
  });

  it('should throw error when packageName is invalid', () => {
    expect(() => {
      Resource<TestResource>('$$', '$$', TestResourceSchema)(TestResource);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid package name: $$"`);
  });

  it('should throw error when resourceName is invalid', () => {
    expect(() => {
      Resource<TestResource>('@octo', '$$', TestResourceSchema)(TestResource);
    }).toThrowErrorMatchingInlineSnapshot(`"Invalid resource name: $$"`);
  });

  it('should throw error when resource class does not extend AResource', () => {
    expect(() => {
      Resource<TestResource>('@octo', 'test', TestResourceSchema)(TestOverlay);
    }).toThrowErrorMatchingInlineSnapshot(`"Class "TestOverlay" must extend the AResource class!"`);
  });

  it('should throw error when registration fails', async () => {
    const resourceSerializationService = await container.get(ResourceSerializationService);
    jest.spyOn(resourceSerializationService, 'registerClass').mockImplementation(() => {
      throw new Error('error');
    });

    Resource<TestResource>('@octo', 'test', TestResourceSchema)(TestResource);

    await expect(async () => {
      await container.waitToResolveAllFactories();
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"error"`);
  });

  describe('when a resource is decorated', () => {
    it('should set static members', async () => {
      expect(TestResource.NODE_NAME).toBeUndefined();
      expect(TestResource.NODE_PACKAGE).toBeUndefined();
      expect(TestResource.NODE_SCHEMA).toBeUndefined();
      expect(TestResource.NODE_TYPE).toBeUndefined();

      Resource<TestResource>('@octo', 'test', TestResourceSchema)(TestResource);

      expect(TestResource.NODE_NAME).toEqual('test');
      expect(TestResource.NODE_PACKAGE).toEqual('@octo');
      expect(TestResource.NODE_SCHEMA).toEqual(TestResourceSchema);
      expect(TestResource.NODE_TYPE).toEqual(NodeType.RESOURCE);
    });

    it('should register a resource', async () => {
      Resource<TestResource>('@octo', 'test', TestResourceSchema)(TestResource);

      await container.waitToResolveAllFactories();

      const resourceSerializationService = await container.get(ResourceSerializationService);
      expect(resourceSerializationService.registerClass).toHaveBeenCalledTimes(1);
    });
  });
});
