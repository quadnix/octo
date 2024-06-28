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
    app.addAnchor(anchor1);

    const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
    expect(overlay1.getAnchors().length).toBe(1);

    overlay1.addAnchor(anchor1);
    expect(overlay1.getAnchors().length).toBe(1);
  });

  describe('addAnchor()', () => {
    it('should create dependency between overlay and anchor parents', () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);

      // App to Overlay dependency.
      expect(app.getDependencies()).toMatchInlineSnapshot(`
       [
         {
           "from": "app=test",
           "relationship": undefined,
           "to": "test-overlay=overlay-1",
         },
       ]
      `);
      expect(
        app.getDependencies()[0].hasMatchingBehavior('MODEL_NAME', DiffAction.DELETE, 'overlayId', DiffAction.DELETE),
      ).toBe(true);

      // Overlay to App dependency.
      expect(overlay1.getDependencies()).toMatchInlineSnapshot(`
       [
         {
           "from": "test-overlay=overlay-1",
           "relationship": undefined,
           "to": "app=test",
         },
       ]
      `);
      expect(
        overlay1.getDependencies()[0].hasMatchingBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.ADD),
      ).toBe(true);
      expect(
        overlay1.getDependencies()[0].hasMatchingBehavior('overlayId', DiffAction.ADD, 'MODEL_NAME', DiffAction.UPDATE),
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
      const overlay1_1 = new TestOverlay('overlay-1', {}, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      overlayService.removeOverlay(overlay1_1);

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
      const overlay1_1 = new TestOverlay('overlay-1', { key1: 'value1', key2: 'value2' }, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', { key1: 'value1', key2: 'value2.1', key3: 'value3' }, []);
      overlayService.addOverlay(overlay1);

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
      const overlay1_1 = new TestOverlay(
        'overlay-1',
        { key1: { 'key1.1': 'value1.1' }, key2: { 'key2.1': 'value2.1' } },
        [],
      );

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay(
        'overlay-1',
        { key1: { 'key1.1': 'value1.3', 'key1.2': 'value1.2' }, key2: { 'key2.1': 'value2.1' } },
        [],
      );
      overlayService.addOverlay(overlay1);

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
      const overlay1_1 = new TestOverlay('overlay-1', { key1: ['value1.1', 'value1.2'] }, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', { key1: ['value1.3', 'value1.4'] }, []);
      overlayService.addOverlay(overlay1);

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

    it('should produce an add diff of anchors', async () => {
      const overlay1_1 = new TestOverlay('overlay-1', {}, []);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "anchor",
           "value": {
             "anchorId": "anchor-1",
             "parent": "app=test",
             "properties": {
               "key1": "value1",
             },
           },
         },
       ]
      `);
    });

    it('should not produce an update diff of anchors with no change', async () => {
      const app_1 = new App('test');
      const anchor1_1 = new TestAnchor('anchor-1', { key1: 'value1' }, app_1);
      app_1.addAnchor(anchor1_1);

      const overlay1_1 = new TestOverlay('overlay-1', {}, [anchor1_1]);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should produce an update diff of anchors with flat properties', async () => {
      const app_1 = new App('test');
      const anchor1_1 = new TestAnchor('anchor-1', { key1: 'value1' }, app_1);
      app_1.addAnchor(anchor1_1);

      const overlay1_1 = new TestOverlay('overlay-1', {}, [anchor1_1]);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', { key2: 'value2' }, app);
      app.addAnchor(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "anchor",
           "value": {
             "anchorId": "anchor-1",
             "parent": "app=test",
             "properties": {
               "key2": "value2",
             },
           },
         },
       ]
      `);
    });

    it('should produce an update diff of anchors with nested properties', async () => {
      const app_1 = new App('test');
      const anchor1_1 = new TestAnchor('anchor-1', { key1: { key2: 'value2' } }, app_1);
      app_1.addAnchor(anchor1_1);

      const overlay1_1 = new TestOverlay('overlay-1', {}, [anchor1_1]);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', { key1: { key2: 'value3' } }, app);
      app.addAnchor(anchor1);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "anchor",
           "value": {
             "anchorId": "anchor-1",
             "parent": "app=test",
             "properties": {
               "key1": {
                 "key2": "value3",
               },
             },
           },
         },
       ]
      `);
    });

    it('should produce a delete diff of anchors', async () => {
      const app_1 = new App('test');
      const anchor1_1 = new TestAnchor('anchor-1', { key1: 'value1' }, app_1);
      app_1.addAnchor(anchor1_1);

      const overlay1_1 = new TestOverlay('overlay-1', {}, [anchor1_1]);

      const overlayDataRepository = await Container.get(OverlayDataRepository, { args: [true, [overlay1_1], []] });
      const overlayService = await Container.get(OverlayService);

      const overlay1 = new TestOverlay('overlay-1', {}, []);
      overlayService.addOverlay(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "anchor",
           "value": {
             "anchorId": "anchor-1",
             "parent": "app=test",
             "properties": {
               "key1": "value1",
             },
           },
         },
       ]
      `);
    });
  });

  describe('remove()', () => {
    it('should be able to mark an overlay as deleted', async () => {
      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      overlay1.remove();

      const overlay1_1 = overlayService.getOverlayById('overlay-1')!;
      expect(overlay1_1).not.toBe(undefined);
      expect(overlay1_1.isMarkedDeleted()).toBe(true);
    });

    it('should be able to completely remove an overlay from repository', async () => {
      const app = new App('test-app');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const overlayService = await Container.get(OverlayService);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1]);
      overlayService.addOverlay(overlay1);

      overlayService.removeOverlay(overlay1);

      const overlay1_1 = overlayService.getOverlayById('overlay-1')!;
      expect(overlay1_1).toBe(undefined);
    });
  });

  describe('removeAnchor()', () => {
    it('should remove dependency between overlay and anchor parents', () => {
      const app1 = new App('test1');
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1.addAnchor(anchor1);

      const app2 = new App('test2');
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2.addAnchor(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);

      expect(overlay1.getDependencies(app1).length).toBe(1);
      expect(overlay1.getDependencies(app2).length).toBe(1);

      overlay1.removeAnchor(anchor1);

      expect(overlay1.getDependencies(app1).length).toBe(0);
      expect(overlay1.getDependencies(app2).length).toBe(1);
    });

    it('should only remove one dependency with parent when multiple anchors have same parent', () => {
      const app = new App('test');
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      expect(overlay1.getAnchors().length).toBe(2);

      expect(app.getDependencies(overlay1).length).toBe(2);
      expect(overlay1.getDependencies(app).length).toBe(2);

      overlay1.removeAnchor(anchor1);
      expect(overlay1.getAnchors().length).toBe(1);

      expect(app.getDependencies(overlay1).length).toBe(1);
      expect(overlay1.getDependencies(app).length).toBe(1);
    });
  });

  describe('removeAllAnchors()', () => {
    it('should remove all anchors with parent dependencies', () => {
      const app1 = new App('test1');
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1.addAnchor(anchor1);

      const app2 = new App('test2');
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2.addAnchor(anchor2);

      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1, anchor2]);
      expect(overlay1.getAnchors().length).toBe(2);
      expect(app1.getDependencies().length).toBe(1);
      expect(app2.getDependencies().length).toBe(1);
      expect(overlay1.getDependencies().length).toBe(2);

      overlay1.removeAllAnchors();
      expect(overlay1.getAnchors().length).toBe(0);
      expect(app1.getDependencies().length).toBe(0);
      expect(app2.getDependencies().length).toBe(0);
      expect(overlay1.getDependencies().length).toBe(0);
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
        app.addAnchor(anchor1);
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
        app.addAnchor(anchor1);
        app.addAnchor(anchor2);
        return app;
      };
      const overlayUnSynth = await AOverlay.unSynth(TestOverlay, overlaySynth, deReferenceContext);

      expect(overlayUnSynth.synth()).toEqual(overlaySynth);
    });
  });
});
