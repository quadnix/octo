import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { InputService } from './input.service.js';

describe('InputService UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  describe('resolve()', () => {
    it('should resolve simple key', async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      const inputService = new InputService(overlayDataRepository, resourceDataRepository);

      inputService.registerInput('testModule', 'key1', 'value1');

      expect(inputService.resolve('testModule.input.key1')).toBe('value1');
    });

    it('should resolve referenced key', async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      const inputService = new InputService(overlayDataRepository, resourceDataRepository);

      inputService.registerInput('testModule', 'key1', 'value1');
      inputService.registerInput('testModule', 'key2', '${{testModule.input.key1}}');

      expect(inputService.resolve('testModule.input.key2')).toBe('value1');
    });

    it('should resolve key with nested reference', async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      const inputService = new InputService(overlayDataRepository, resourceDataRepository);

      inputService.registerInput('testModule', 'key1', 'value1');
      inputService.registerInput('testModule', 'key2', {
        key3: 'value4',
        key4: '${{testModule.input.key1}}',
        key5: ['${{testModule.input.key1}}'],
        key6: { key7: { key8: [{ key9: '${{testModule.input.key1}}' }] } },
      });

      expect(inputService.resolve('testModule.input.key2')).toEqual({
        key3: 'value4',
        key4: 'value1',
        key5: ['value1'],
        key6: { key7: { key8: [{ key9: 'value1' }] } },
      });
    });

    it('should substitute undefined if any reference is not resolved', async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      const inputService = new InputService(overlayDataRepository, resourceDataRepository);

      inputService.registerInput('testModule', 'key1', 'value1');
      inputService.registerInput('testModule', 'key2', {
        key3: 'value4',
        key4: '${{testModule.input.key1}}',
        key5: ['${{testModule.input.key1}}'],
        key6: { key7: { key8: [{ key9: '${{testModule.input.key0}}' }] } },
      });

      expect(inputService.resolve('testModule.input.key2')).toEqual({
        key3: 'value4',
        key4: 'value1',
        key5: ['value1'],
        key6: { key7: { key8: [{ key9: undefined }] } },
      });
    });

    it('should throw error if any reference results in recursion', async () => {
      const [overlayDataRepository, resourceDataRepository] = await Promise.all([
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);
      const inputService = new InputService(overlayDataRepository, resourceDataRepository);

      inputService.registerInput('testModule', 'key1', '${{testModule.input.key1}}');

      expect(() => {
        inputService.resolve('testModule.input.key1');
      }).toThrow('Input could not be resolved!');
    });
  });
});
