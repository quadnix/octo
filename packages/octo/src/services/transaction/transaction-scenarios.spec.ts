import { jest } from '@jest/globals';
import { SharedTestResource, TestResource } from '../../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../../test/helpers/test-models.js';
import { Container } from '../../functions/container/container.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import { type IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../resources/resource-data.repository.js';
import { CaptureService, CaptureServiceFactory } from '../capture/capture.service.js';
import { InputService, InputServiceFactory } from '../input/input.service.js';
import {
  ResourceSerializationService,
  ResourceSerializationServiceFactory,
} from '../serialization/resource/resource-serialization.service.js';
import { TransactionService, TransactionServiceFactory } from './transaction.service.js';

describe('Transaction Scenarios UT', () => {
  const universalResourceAction: IResourceAction = {
    ACTION_NAME: 'universal',
    filter: () => true,
    handle: jest.fn() as jest.Mocked<any>,
    mock: jest.fn() as jest.Mocked<any>,
  };

  beforeEach(async () => {
    Container.registerFactory(CaptureService, CaptureServiceFactory);

    Container.registerFactory(InputService, InputServiceFactory);

    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    await Container.get(OverlayDataRepository);

    Container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    await Container.get(ResourceDataRepository, { args: [true, [], [], []] });

    Container.registerFactory(ResourceSerializationService, ResourceSerializationServiceFactory);
    const resourceSerializationService = await Container.get(ResourceSerializationService, { args: [true] });
    resourceSerializationService.registerClass('SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('TestResource', TestResource);

    Container.registerFactory(TransactionService, TransactionServiceFactory);
    await Container.get(TransactionService, { args: [true] });
  });

  afterEach(() => {
    Container.reset();

    jest.restoreAllMocks();
  });

  describe('when actual and old resources are equal', () => {
    beforeEach(async () => {
      const transactionService = await Container.get(TransactionService);
      transactionService.registerResourceActions([universalResourceAction]);

      await createTestResources({ 'resource-1': [] });
      const generator = await transactionService.beginTransaction([]);
      await generator.next();
      await commitResources();
    });

    describe('when no resources are modified', () => {
      it('should not produce any resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when resources are modified', () => {
      it('should produce new resource changes on adding new resource', async () => {
        const transactionService = await Container.get(TransactionService);
        transactionService.registerResourceActions([universalResourceAction]);

        await createTestResources({ 'resource-1': [], 'resource-2': [] });

        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when resources are reverted', () => {
      it('should produce new resource changes', async () => {
        const transactionService = await Container.get(TransactionService);
        transactionService.registerResourceActions([universalResourceAction]);

        // Create a change.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator1 = await transactionService.beginTransaction([]);
        await generator1.next();
        await commitResources();

        // Revert last change.
        const [, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource2.remove();
        const generator2 = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator2.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator2.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });
  });

  describe('when actual is behind old on add', () => {
    beforeEach(async () => {
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await Container.get(TransactionService);
      transactionService.registerResourceActions([universalResourceAction]);

      await createTestResources({ 'resource-1': [] });
      const generator = await transactionService.beginTransaction([]);

      try {
        await generator.next();
      } catch (error) {
        await commitResources();
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-1",
               "value": "resource-1",
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are modified', () => {
      it('should produce new and dirty resource changes on adding new resource', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-1",
               "value": "resource-1",
             },
           ],
         ]
        `);
      });

      it('should throw error on adding new resource with dependency on dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.properties['key1'] = 'value1';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-1",
               "value": "resource-1",
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are reverted', () => {
      it('should produce new resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-2': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });
  });

  describe('when actual is behind old on modify', () => {
    beforeEach(async () => {
      // Successfully add resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockResolvedValueOnce();
      // Fail on modifying resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await Container.get(TransactionService);
      transactionService.registerResourceActions([universalResourceAction]);

      // Add resource-1.
      await createTestResources({ 'resource-1': [] });
      const generator1 = await transactionService.beginTransaction([]);
      await generator1.next();
      await commitResources();

      // Modify resource-1.
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      const generator2 = await transactionService.beginTransaction([]);

      try {
        await generator2.next();
      } catch (error) {
        await commitResources();
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value1';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "properties",
               "node": "test-resource=resource-1",
               "value": {
                 "key": "key1",
                 "value": "value1",
               },
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are modified', () => {
      it('should produce new and dirty resource changes on adding new resource', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.properties['key1'] = 'value1';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "properties",
               "node": "test-resource=resource-1",
               "value": {
                 "key": "key1",
                 "value": "value1",
               },
             },
           ],
         ]
        `);
      });

      it('should throw error on adding new resource with dependency on dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
        resource1.properties['key1'] = 'value1';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value2';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "properties",
               "node": "test-resource=resource-1",
               "value": {
                 "key": "key1",
                 "value": "value2",
               },
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are reverted', () => {
      it('should not produce any resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and no dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });
  });

  describe('when actual is behind old on delete', () => {
    beforeEach(async () => {
      // Successfully add resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockResolvedValueOnce();
      // Fail on deleting resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await Container.get(TransactionService);
      transactionService.registerResourceActions([universalResourceAction]);

      // Add resource-1.
      await createTestResources({ 'resource-1': [] });
      const generator1 = await transactionService.beginTransaction([]);
      await generator1.next();
      await commitResources();

      // Delete resource-1.
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.remove();
      const generator2 = await transactionService.beginTransaction([]);

      try {
        await generator2.next();
      } catch (error) {
        await commitResources();
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.remove();
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "test-resource=resource-1",
               "value": "resource-1",
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are modified', () => {
      it('should produce new and dirty resource changes on adding new resource', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.remove();
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "test-resource=resource-1",
               "value": "resource-1",
             },
           ],
         ]
        `);
      });

      it('should throw error on adding new resource with dependency on dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.remove();
        resource1.addChild('resourceId', resource2, 'resourceId');
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await Container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value2';
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "properties",
               "node": "test-resource=resource-1",
               "value": {
                 "key": "key1",
                 "value": "value2",
               },
             },
           ],
         ]
        `);
      });
    });

    describe('when resources are reverted', () => {
      it('should not produce any resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and no dirty resource changes', async () => {
        const transactionService = await Container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = await transactionService.beginTransaction([], {
          yieldDirtyResourceTransaction: true,
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "test-resource=resource-2",
               "value": "resource-2",
             },
           ],
         ]
        `);

        const dirtyResourceTransaction = (await generator.next()).value;
        expect(dirtyResourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });
  });
});
