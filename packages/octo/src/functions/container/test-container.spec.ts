import { jest } from '@jest/globals';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';
import type { Container } from './container.js';
import { TestContainer } from './test-container.js';

describe('TestContainer UT', () => {
  let container: Container;

  beforeAll(async () => {
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
    await expect(async () => {
      await container.get(ResourceSerializationService);
    }).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Timed out waiting for factory "ResourceSerializationService" to resolve!"`,
    );
  });
});
