import { jest } from '@jest/globals';
import { TestOverlay } from '../../../test/helpers/test-classes.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';
import type { Container } from './container.js';
import { TestContainer } from './test-container.js';

describe('TestContainer UT', () => {
  describe('bootstrap()', () => {
    afterEach(async () => {
      await TestContainer.reset();
    });

    it('should reset all factories', async () => {
      const container1 = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 50 });
      const overlayDataRepository1 = await container1.get(OverlayDataRepository);
      overlayDataRepository1.add(new TestOverlay('overlay-1', {}, []));
      expect(overlayDataRepository1.getByContext('@octo/test-overlay=overlay-1')).not.toBeUndefined();

      const container2 = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 50 });
      const overlayDataRepository2 = await container2.get(OverlayDataRepository);
      expect(overlayDataRepository2.getByContext('@octo/test-overlay=overlay-1')).toBeUndefined();
    });
  });

  describe('create()', () => {
    let container: Container;

    beforeEach(async () => {
      container = await TestContainer.create(
        {
          mocks: [
            {
              type: ModelSerializationService,
              value: jest.fn(),
            },
            // Register a new factory with metadata for testing purposes.
            {
              metadata: { test: 'true' },
              type: ModelSerializationService,
              value: 'My Mock',
            },
          ],
        },
        { factoryTimeoutInMs: 50 },
      );
    });

    afterEach(async () => {
      await TestContainer.reset();
    });

    it('should setup factory with mock value', async () => {
      const modelSerializationService = await container.get<jest.Mock>(ModelSerializationService as any);
      expect(modelSerializationService.getMockName()).toBe('jest.fn()');
    });

    it('should setup factory with mock value and metadata', async () => {
      const modelSerializationService = await container.get<string>(ModelSerializationService as any, {
        metadata: { test: 'true' },
      });
      expect(modelSerializationService).toBe('My Mock');
    });

    it('should timeout waiting for factories that are not setup with TestContainer', async () => {
      container.unRegisterFactory(ResourceSerializationService);

      await expect(async () => {
        await container.get(ResourceSerializationService);
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Timed out waiting for factory "ResourceSerializationService" to resolve!"`,
      );
    });
  });
});
