import { TestAnchor, TestOverlay } from '../../test/helpers/test-classes.js';
import { Container } from '../decorators/container.js';
import { DiffAction } from '../functions/diff/diff.js';
import { App } from '../models/app/app.model.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from './overlay-data.repository.js';
import { AOverlay } from './overlay.abstract.js';
import { OverlayService, OverlayServiceFactory } from './overlay.service.js';

describe('Overlay UT', () => {
  beforeEach(() => {
    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(OverlayService, OverlayServiceFactory);
  });

  afterEach(() => {
    Container.reset();
  });

  it('should not create duplicate anchors', () => {
    const app = new App('test');
    const anchor1 = new TestAnchor('anchor-1', {}, app);
    app['anchors'].push(anchor1);

    const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
    expect(overlay1.getAnchors().length).toBe(1);

    overlay1.addAnchor(anchor1);
    expect(overlay1.getAnchors().length).toBe(1);
  });

  describe('addAnchor()', () => {
    it('should create dependency between overlay and anchor parents', () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app['anchors'].push(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);

      // App to Overlay dependency.
      expect(app['dependencies']).toMatchInlineSnapshot(`
       [
         {
           "from": "app=test",
           "relationship": undefined,
           "to": "test-overlay=overlay-1",
         },
       ]
      `);
      expect(
        app['dependencies'][0].hasMatchingBehavior('MODEL_NAME', DiffAction.DELETE, 'overlayId', DiffAction.DELETE),
      ).toBe(true);

      // Overlay to App dependency.
      expect(overlay1['dependencies']).toMatchInlineSnapshot(`
       [
         {
           "from": "test-overlay=overlay-1",
           "relationship": undefined,
           "to": "app=test",
         },
       ]
      `);
      expect(
        overlay1['dependencies'][0].hasMatchingBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.ADD),
      ).toBe(true);
      expect(
        overlay1['dependencies'][0].hasMatchingBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.UPDATE),
      ).toBe(true);
    });
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);
      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "overlayId",
           "value": "overlay-1",
         },
       ]
      `);
    });

    it('should produce a delete diff', async () => {
      const overlay1 = new TestOverlay('overlay-1', {}, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1], []] });
      const overlayService = await Container.get(OverlayService);

      overlayService.removeOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "overlayId",
           "value": "overlay-1",
         },
       ]
      `);
    });

    it('should produce an update diff of flat properties', async () => {
      const overlay1_0 = new TestOverlay('overlay-1', { key1: 'value1', key2: 'value2' }, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_0], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1_1 = new TestOverlay('overlay-1', { key1: 'value1', key2: 'value2.1', key3: 'value3' }, []);
      overlayService.addOverlay(overlay1_1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "value": {
             "key": "key2",
             "value": "value2.1",
           },
         },
         {
           "action": "add",
           "field": "properties",
           "value": {
             "key": "key3",
             "value": "value3",
           },
         },
       ]
      `);
    });

    it('should produce an update diff of nested properties', async () => {
      const overlay1_0 = new TestOverlay(
        'overlay-1',
        { key1: { 'key1.1': 'value1.1' }, key2: { 'key2.1': 'value2.1' } },
        [],
      );

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_0], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1_1 = new TestOverlay(
        'overlay-1',
        { key1: { 'key1.1': 'value1.3', 'key1.2': 'value1.2' }, key2: { 'key2.1': 'value2.1' } },
        [],
      );
      overlayService.addOverlay(overlay1_1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
            [
              {
                "action": "update",
                "field": "properties",
                "value": {
                  "key": "key1",
                  "value": {
                    "key1.1": "value1.3",
                    "key1.2": "value1.2",
                  },
                },
              },
            ]
          `);
    });

    it('should produce an update diff of array properties', async () => {
      const overlay1_0 = new TestOverlay('overlay-1', { key1: ['value1.1', 'value1.2'] }, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_0], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1_1 = new TestOverlay('overlay-1', { key1: ['value1.3', 'value1.4'] }, []);
      overlayService.addOverlay(overlay1_1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "value": {
             "key": "key1",
             "value": [
               "value1.3",
               "value1.4",
             ],
           },
         },
       ]
      `);
    });
  });

  describe('removeAnchor()', () => {
    it('should remove dependency between overlay and anchor parents', () => {
      const app1 = new App('test1');
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1['anchors'].push(anchor1);

      const app2 = new App('test2');
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2['anchors'].push(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);

      expect(overlay1['dependencies'].find((d) => d.to.getContext() === app1.getContext())).toBeTruthy();
      expect(overlay1['dependencies'].find((d) => d.to.getContext() === app2.getContext())).toBeTruthy();

      overlay1.removeAnchor(anchor1);

      expect(overlay1['dependencies'].find((d) => d.to.getContext() === app1.getContext())).toBeFalsy();
      expect(overlay1['dependencies'].find((d) => d.to.getContext() === app2.getContext())).toBeTruthy();
    });

    it('should only remove one dependency with parent when multiple anchors have same parent', () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app['anchors'].push(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app['anchors'].push(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      expect(overlay1.getAnchors().length).toBe(2);

      expect(app['dependencies'].filter((d) => d.to.getContext() === overlay1.getContext()).length).toBe(2);
      expect(overlay1['dependencies'].filter((d) => d.to.getContext() === app.getContext()).length).toBe(2);

      overlay1.removeAnchor(anchor1);
      expect(overlay1.getAnchors().length).toBe(1);

      expect(app['dependencies'].filter((d) => d.to.getContext() === overlay1.getContext()).length).toBe(1);
      expect(overlay1['dependencies'].filter((d) => d.to.getContext() === app.getContext()).length).toBe(1);
    });
  });

  describe('removeAllAnchors()', () => {
    it('should remove all anchors with parent dependencies', () => {
      const app1 = new App('test1');
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1['anchors'].push(anchor1);

      const app2 = new App('test2');
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2['anchors'].push(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      expect(overlay1.getAnchors().length).toBe(2);
      expect(app1['dependencies'].length).toBe(1);
      expect(app2['dependencies'].length).toBe(1);
      expect(overlay1['dependencies'].length).toBe(2);

      overlay1.removeAllAnchors();
      expect(overlay1.getAnchors().length).toBe(0);
      expect(app1['dependencies'].length).toBe(0);
      expect(app2['dependencies'].length).toBe(0);
      expect(overlay1['dependencies'].length).toBe(0);
    });
  });

  describe('synth()', () => {
    it('should be able to synth an empty overlay', () => {
      const overlay = new TestOverlay('overlay-1', {}, []);

      expect(overlay.synth()).toMatchInlineSnapshot(`
        {
          "anchors": [],
          "overlayId": "overlay-1",
          "properties": {},
        }
      `);
    });

    it('should be able to synth with anchors', () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      const overlay = new TestOverlay('overlay-1', { key1: 'value1' }, [anchor1, anchor2]);

      expect(overlay.synth()).toMatchInlineSnapshot(`
        {
          "anchors": [
            {
              "anchorId": "anchor-1",
              "parent": {
                "context": "app=test",
              },
              "properties": {},
            },
            {
              "anchorId": "anchor-2",
              "parent": {
                "context": "app=test",
              },
              "properties": {},
            },
          ],
          "overlayId": "overlay-1",
          "properties": {
            "key1": "value1",
          },
        }
      `);
    });
  });

  describe('unSynth', () => {
    it('should throw error while unSynth if anchor not found', async () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      const overlay = new TestOverlay('overlay-1', { key1: 'value1' }, [anchor1, anchor2]);
      const overlaySynth = overlay.synth();

      const deReferenceContext = async (): Promise<App> => {
        const app = new App('test');
        app['anchors'].push(anchor1);
        return app;
      };

      await expect(async () => {
        await AOverlay.unSynth(TestOverlay, overlaySynth, deReferenceContext);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Cannot find anchor while deserializing overlay!"`);
    });

    it('should be able to unSynth with anchors', async () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      const overlay = new TestOverlay('overlay-1', { key1: 'value1' }, [anchor1, anchor2]);
      const overlaySynth = overlay.synth();

      const deReferenceContext = async (): Promise<App> => {
        const app = new App('test');
        app['anchors'].push(anchor1, anchor2);
        return app;
      };
      const overlayUnSynth = await AOverlay.unSynth(TestOverlay, overlaySynth, deReferenceContext);

      expect(overlayUnSynth.synth()).toEqual(overlaySynth);
    });
  });
});
