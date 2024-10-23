import { jest } from '@jest/globals';
import { SharedTestResource, TestResource } from '../../../test/helpers/test-classes.js';
import { commitResources, createTestResources } from '../../../test/helpers/test-models.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from '../../overlays/overlay-data.repository.js';
import { OverlayService } from '../../overlays/overlay.service.js';
import { type IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository, ResourceDataRepositoryFactory } from '../../resources/resource-data.repository.js';
import { CaptureService } from '../capture/capture.service.js';
import { InputService } from '../input/input.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { TransactionService } from './transaction.service.js';

describe('Transaction Scenarios UT', () => {
  const universalResourceAction: IResourceAction = {
    filter: () => true,
    handle: jest.fn() as jest.Mocked<any>,
    mock: jest.fn() as jest.Mocked<any>,
  };

  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    // In these tests, we commit models, which resets the OverlayDataRepository.
    // We cannot use TestContainer to mock OverlayDataRepositoryFactory,
    // or else commit of models won't reset anything.
    container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    const overlayDataRepository = await container.get<OverlayDataRepository, typeof OverlayDataRepositoryFactory>(
      OverlayDataRepository,
      {
        args: [true],
      },
    );

    // In these tests, we commit resources, which resets the ResourceDataRepository.
    // We cannot use TestContainer to mock ResourceDataRepositoryFactory,
    // or else commit of resources won't reset anything.
    container.registerFactory(ResourceDataRepository, ResourceDataRepositoryFactory);
    const resourceDataRepository = await container.get<ResourceDataRepository, typeof ResourceDataRepositoryFactory>(
      ResourceDataRepository,
      { args: [true, [], [], []] },
    );

    const captureService = new CaptureService();
    container.registerValue(CaptureService, captureService);

    const inputService = new InputService(resourceDataRepository);
    container.registerValue(InputService, inputService);

    container.registerValue(OverlayService, new OverlayService(overlayDataRepository));

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    resourceSerializationService.registerClass('@octo/SharedTestResource', SharedTestResource);
    resourceSerializationService.registerClass('@octo/TestResource', TestResource);
    container.registerValue<ResourceSerializationService>(ResourceSerializationService, resourceSerializationService);

    container.registerValue(
      TransactionService,
      new TransactionService(captureService, inputService, overlayDataRepository, resourceDataRepository),
    );
  });

  afterEach(async () => {
    await TestContainer.reset();

    jest.restoreAllMocks();
  });

  describe('when actual and old resources are equal', () => {
    beforeEach(async () => {
      const transactionService = await container.get(TransactionService);
      transactionService.registerResourceActions(TestResource, [universalResourceAction]);

      await createTestResources({ 'resource-1': [] });
      const generator = transactionService.beginTransaction([]);
      await generator.next();
      await commitResources();
    });

    describe('when no resources are modified', () => {
      it('should not produce any resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when resources are modified', () => {
      it('should produce new resource changes on adding new resource', async () => {
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [], 'resource-2': [] });

        const generator = transactionService.beginTransaction([], {
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
      });
    });

    describe('when resources are reverted', () => {
      it('should produce new resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        // Create a change.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator1 = transactionService.beginTransaction([]);
        await generator1.next();
        await commitResources();

        // Revert last change.
        const [, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource2.remove();
        const generator2 = transactionService.beginTransaction([], {
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
      });
    });
  });

  describe('when actual is behind old on add', () => {
    beforeEach(async () => {
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await container.get(TransactionService);
      transactionService.registerResourceActions(TestResource, [universalResourceAction]);

      await createTestResources({ 'resource-1': [] });
      const generator = transactionService.beginTransaction([]);

      try {
        await generator.next();
      } catch (error) {
        await commitResources({ skipAddActualResource: true });
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
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
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = transactionService.beginTransaction([], {
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
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.properties['key1'] = 'value1';
        const generator = transactionService.beginTransaction([], {
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
        const transactionService = await container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-2': [] });
        const generator = transactionService.beginTransaction([], {
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
      });
    });
  });

  describe('when actual is behind old on modify', () => {
    beforeEach(async () => {
      // Successfully add resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockResolvedValueOnce();
      // Fail on modifying resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await container.get(TransactionService);
      transactionService.registerResourceActions(TestResource, [universalResourceAction]);

      // Add resource-1.
      await createTestResources({ 'resource-1': [] });
      const generator1 = transactionService.beginTransaction([]);
      await generator1.next();
      await commitResources();

      // Modify resource-1.
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.properties['key1'] = 'value1';
      const generator2 = transactionService.beginTransaction([]);

      try {
        await generator2.next();
      } catch (error) {
        await commitResources({ skipAddActualResource: true });
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value1';
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
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
        const transactionService = await container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.properties['key1'] = 'value1';
        const generator = transactionService.beginTransaction([], {
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
        const transactionService = await container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': ['resource-1'] });
        resource1.properties['key1'] = 'value1';
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value2';
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
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
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and no dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = transactionService.beginTransaction([], {
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
      });
    });
  });

  describe('when actual is behind old on delete', () => {
    beforeEach(async () => {
      // Successfully add resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockResolvedValueOnce();
      // Fail on deleting resource-1.
      (universalResourceAction.handle as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('error'));

      const transactionService = await container.get(TransactionService);
      transactionService.registerResourceActions(TestResource, [universalResourceAction]);

      // Add resource-1.
      await createTestResources({ 'resource-1': [] });
      const generator1 = transactionService.beginTransaction([]);
      await generator1.next();
      await commitResources();

      // Delete resource-1.
      const [resource1] = await createTestResources({ 'resource-1': [] });
      resource1.remove();
      const generator2 = transactionService.beginTransaction([]);

      try {
        await generator2.next();
      } catch (error) {
        await commitResources({ skipAddActualResource: true });
      }
    });

    describe('when no resources are modified', () => {
      it('should only produce dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.remove();
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
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
        const transactionService = await container.get(TransactionService);

        const [resource1] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.remove();
        const generator = transactionService.beginTransaction([], {
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
        const transactionService = await container.get(TransactionService);

        const [resource1, resource2] = await createTestResources({ 'resource-1': [], 'resource-2': [] });
        resource1.remove();
        resource1.addChild('resourceId', resource2, 'resourceId');
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        await expect(generator.next()).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot operate diff on dirty resources!"`,
        );
      });

      it('should produce new and dirty resource changes on modifying dirty resource', async () => {
        const transactionService = await container.get(TransactionService);

        // Modify resource-1 which is already a dirty resource.
        const [resource1] = await createTestResources({ 'resource-1': [] });
        resource1.properties['key1'] = 'value2';
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`
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
        const transactionService = await container.get(TransactionService);

        await createTestResources({ 'resource-1': [] });
        const generator = transactionService.beginTransaction([], {
          yieldResourceTransaction: true,
        });

        const resourceTransaction = (await generator.next()).value;
        expect(resourceTransaction).toMatchInlineSnapshot(`[]`);
      });
    });

    describe('when new resources are added and old resources are reverted', () => {
      it('should produce new and no dirty resource changes', async () => {
        const transactionService = await container.get(TransactionService);

        // Not creating resource-1 is equivalent to reverting the last change in this case.
        await createTestResources({ 'resource-1': [], 'resource-2': [] });
        const generator = transactionService.beginTransaction([], {
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
      });
    });
  });
});
