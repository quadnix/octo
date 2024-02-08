import { jest } from '@jest/globals';
import {
  ModelSerializationService,
  ModelSerializationServiceFactory,
} from '../services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../services/serialization/resource/resource-serialization.service.js';
import { Container } from './container.js';
import { TestContainer } from './test-container.js';

describe('TestContainer UT', () => {
  beforeAll(() => {
    // Register a new factory with metadata for testing purposes.
    Container.registerFactory(ModelSerializationService, ModelSerializationServiceFactory, {
      metadata: { test: 'true' },
    });

    TestContainer.create(
      [
        {
          type: ModelSerializationService,
          value: jest.fn(),
        },
        {
          metadata: { test: 'true' },
          type: ModelSerializationService,
          value: 'My Mock',
        },
      ],
      { factoryTimeoutInMs: 500 },
    );
  });

  it('should replace old factory with new mock', async () => {
    const modelSerializationService = await Container.get<jest.Mock>(ModelSerializationService as any);
    expect(modelSerializationService.getMockName()).toBe('jest.fn()');
  });

  it('should replace old factory with metadata with new mock', async () => {
    const modelSerializationService = await Container.get<string>(ModelSerializationService as any, {
      metadata: { test: 'true' },
    });
    expect(modelSerializationService).toBe('My Mock');
  });

  it('should not replace old factory when no mock given', async () => {
    const resourceSerializationService = await Container.get(ResourceSerializationService);
    expect(typeof resourceSerializationService['getMockName']).toBe('undefined');
    expect(typeof resourceSerializationService.serialize).toBe('function');
  });
});
