import { TestOverlay } from '../../test/helpers/test-classes.js';
import type { UnknownOverlay } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { App } from '../models/app/app.model.js';
import { OverlayDataRepository } from './overlay-data.repository.js';

describe('OverlayDataRepository UT', () => {
  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            type: OverlayDataRepository,
            value: new OverlayDataRepository([]),
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(() => {
    Container.reset();
  });

  describe('add()', () => {
    it('should throw error if instance is not an overlay', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      expect(() => {
        const app = new App('test');
        overlayDataRepository.add(app as unknown as UnknownOverlay);
      }).toThrowErrorMatchingInlineSnapshot(`"Adding non-overlay model!"`);
    });

    it('should add an overlay', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const overlay = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay);

      expect(overlayDataRepository.getById('overlay-1')).toBe(overlay);
    });

    it('should not add the same overlay twice', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const overlay = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay);
      overlayDataRepository.add(overlay);

      expect(overlayDataRepository.getByProperties().length).toBe(1);
    });
  });

  describe('getById()', () => {
    it('should get an overlay by id', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const overlay = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay);

      expect(overlayDataRepository.getById('overlay-1')).toBe(overlay);
    });
  });

  describe('getByProperties()', () => {
    it('should get all overlays without any filters', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay1);

      const overlays = overlayDataRepository.getByProperties();
      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });

    it('should be able to filter overlays based on filters', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlay1.properties.key1 = 'value1';
      overlayDataRepository.add(overlay1);
      const overlay2 = new TestOverlay('overlay-2', {}, []);
      overlay2.properties.key1 = 'value2';
      overlayDataRepository.add(overlay2);

      const overlays = overlayDataRepository.getByProperties([{ key: 'key1', value: 'value1' }]);
      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });
  });
});
