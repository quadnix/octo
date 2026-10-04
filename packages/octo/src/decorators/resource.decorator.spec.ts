import { jest } from '@jest/globals';
import { NodeType } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { Schema } from '../functions/schema/schema.js';
import { AResource } from '../resources/resource.abstract.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { TestResource } from '../utilities/test-helpers/test-classes.js';
import { createOverlay } from '../utilities/test-helpers/test-overlays.js';
import { Resource } from './resource.decorator.js';

const TestOverlay = createOverlay('test-overlay').setClassName('TestOverlay');

class TestResourceSchema extends BaseResourceSchema {}

class TestTableSchema extends BaseResourceSchema {
  override properties = Schema<{
    accountId: string;
    indexes: { name: string; size: number }[];
    regionId: string;
    tableName: string;
    tags: string[];
  }>();
}

class TestTable extends AResource<TestTableSchema, TestTable> {
  constructor(resourceId: string, properties: TestTableSchema['properties']) {
    super(resourceId, properties, []);
  }
}

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
    // @ts-expect-error static members are readonly.
    TestResource['UNIQUE_PROPERTIES'] = undefined;

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
      expect(TestResource.UNIQUE_PROPERTIES).toEqual([]);
    });

    it('should set the unique names', async () => {
      Resource<TestTable>('@octo', 'test-table', TestTableSchema, {
        uniqueProperties: [
          { path: 'tableName', within: ['accountId', 'regionId'] },
          { path: 'indexes[].name', within: ['accountId'] },
          { path: 'tags[]', within: [] },
        ],
      })(TestTable);

      expect(TestTable.UNIQUE_PROPERTIES).toEqual([
        { path: 'tableName', within: ['accountId', 'regionId'] },
        { path: 'indexes[].name', within: ['accountId'] },
        { path: 'tags[]', within: [] },
      ]);
    });

    it('should not type-check a unique name the properties do not have', () => {
      Resource<TestTable>('@octo', 'test-table', TestTableSchema, {
        // @ts-expect-error the property does not exist.
        uniqueProperties: [{ path: 'tableTitle', within: [] }],
      });

      Resource<TestTable>('@octo', 'test-table', TestTableSchema, {
        // @ts-expect-error a path must end at a string.
        uniqueProperties: [{ path: 'indexes[].size', within: [] }],
      });

      Resource<TestTable>('@octo', 'test-table', TestTableSchema, {
        // @ts-expect-error an array is named with `[]`.
        uniqueProperties: [{ path: 'indexes.name', within: [] }],
      });

      Resource<TestTable>('@octo', 'test-table', TestTableSchema, {
        // @ts-expect-error the domain property does not exist.
        uniqueProperties: [{ path: 'tableName', within: ['awsRegionId'] }],
      });
    });

    it('should register a resource', async () => {
      Resource<TestResource>('@octo', 'test', TestResourceSchema)(TestResource);

      await container.waitToResolveAllFactories();

      const resourceSerializationService = await container.get(ResourceSerializationService);
      expect(resourceSerializationService.registerClass).toHaveBeenCalledTimes(1);
    });
  });
});
