import { TestAnchor, TestOverlay } from '../../test/helpers/test-classes.js';
import { create } from '../../test/helpers/test-models.js';
import type { Container } from '../functions/container/container.js';
import { TestContainer } from '../functions/container/test-container.js';
import { OverlayDataRepository } from './overlay-data.repository.js';
import { OverlayService } from './overlay.service.js';

describe('OverlayService UT', () => {
  let container: Container;

  beforeEach(async () => {
    const overlayDataRepository = new OverlayDataRepository([]);

    container = await TestContainer.create(
      {
        mocks: [
          {
            type: OverlayDataRepository,
            value: overlayDataRepository,
          },
          {
            type: OverlayService,
            value: new OverlayService(overlayDataRepository),
          },
        ],
      },
      {
        factoryTimeoutInMs: 500,
      },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  describe('addOverlay()', () => {
    it('should add an overlay', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      expect(overlayService.getOverlayById('overlay-1')).toBe(overlay1);
    });
  });

  describe('getOverlayById()', () => {
    it('should get an overlay by id', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      expect(overlayService.getOverlayById('overlay-1')).toBe(overlay1);
    });
  });

  describe('getOverlays()', () => {
    it('should get all overlays', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      const overlays = overlayService.getOverlays();

      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });

    it('should be able to filter excluded overlays', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      const overlays = overlayService.getOverlays({ excludeOverlayIds: ['overlay-1'] });

      expect(overlays.length).toBe(0);
    });

    it('should be able to filter overlays by anchor', async () => {
      const overlayService = await container.get(OverlayService);

      const {
        app: [app],
      } = create({ app: ['test1'], region: ['region'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      overlayService.addOverlay(overlay1);

      const overlays_1 = overlayService.getOverlays({ anchor: { anchorId: 'anchor-1', parent: app } });
      expect(overlays_1.length).toBe(1);
      expect(overlays_1[0]).toBe(overlay1);

      const overlays_2 = overlayService.getOverlays({ anchor: { anchorId: 'anchor-2', parent: app } });
      expect(overlays_2.length).toBe(1);
      expect(overlays_2[0]).toBe(overlay1);
    });

    it('should be able to apply all filters', async () => {
      const overlayService = await container.get(OverlayService);

      const {
        app: [app],
      } = create({ app: ['test1'], region: ['region'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      overlayService.addOverlay(overlay1);

      const overlays = overlayService.getOverlays({
        anchor: { anchorId: 'anchor-1', parent: app },
        excludeOverlayIds: ['overlay-1'],
      });
      expect(overlays.length).toBe(0);
    });
  });

  describe('getOverlaysByProperties()', () => {
    it('should get all overlays without any filters', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      const overlays = overlayService.getOverlaysByProperties();
      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });

    it('should be able to filter overlays based on filters', async () => {
      const overlayService = await container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlay1.properties.key1 = 'value1';
      overlayService.addOverlay(overlay1);
      const overlay2 = new TestOverlay('overlay-2', {}, []);
      overlay2.properties.key1 = 'value2';
      overlayService.addOverlay(overlay2);

      const overlays = overlayService.getOverlaysByProperties([{ key: 'key1', value: 'value1' }]);
      expect(overlays.length).toBe(1);
      expect(overlays[0]).toBe(overlay1);
    });
  });
});
