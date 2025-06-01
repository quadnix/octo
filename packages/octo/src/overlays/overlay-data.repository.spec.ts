import type { UnknownOverlay } from '../app.type.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { App } from '../models/app/app.model.js';
import { TestOverlay } from '../utilities/test-helpers/test-classes.js';
import { OverlayDataRepository } from './overlay-data.repository.js';

describe('OverlayDataRepository UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('add()', () => {
    it('should throw error if instance is not an overlay', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      expect(() => {
        const app = new App('test');
        overlayDataRepository.add(app as unknown as UnknownOverlay);
      }).toThrowErrorMatchingInlineSnapshot(`"Adding non-overlay model!"`);
    });

    it('should add an overlay', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      const overlay = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay);

      expect(overlayDataRepository.getByContext(overlay.getContext())).toBe(overlay);
    });

    it('should throw error adding same overlay twice', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      expect(() => {
        const overlay = new TestOverlay('overlay-1', {}, []);
        overlayDataRepository.add(overlay);
        overlayDataRepository.add(overlay);
      }).toThrowErrorMatchingInlineSnapshot(`"Overlay already exists!"`);
    });
  });

  describe('getByContext()', () => {
    it('should get an overlay by context', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      const overlay = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay);

      expect(overlayDataRepository.getByContext(overlay.getContext())).toBe(overlay);
    });
  });

  describe('getByProperties()', () => {
    it('should get all overlays without any filters', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayDataRepository.add(overlay1);

      const overlays = overlayDataRepository.getByProperties();
      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });

    it('should be able to filter overlays based on filters', async () => {
      const overlayDataRepository = await container.get(OverlayDataRepository);

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
