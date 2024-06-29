import { TestAnchor, TestOverlay } from '../../test/helpers/test-classes.js';
import { commit, create, createTestOverlays } from '../../test/helpers/test-models.js';
import { Container } from '../decorators/container.js';
import { App } from '../models/app/app.model.js';
import {
  ModelSerializationService,
  ModelSerializationServiceFactory,
} from '../services/serialization/model/model-serialization.service.js';
import { OverlayDataRepository, OverlayDataRepositoryFactory } from './overlay-data.repository.js';
import { AOverlay } from './overlay.abstract.js';
import { OverlayService, OverlayServiceFactory } from './overlay.service.js';

describe('Overlay UT', () => {
  beforeEach(async () => {
    Container.registerFactory(OverlayDataRepository, OverlayDataRepositoryFactory);
    await Container.get(OverlayDataRepository, { args: [true, [], []] });

    Container.registerFactory(OverlayService, OverlayServiceFactory);

    Container.registerFactory(ModelSerializationService, ModelSerializationServiceFactory);
    const modelSerializationService = await Container.get(ModelSerializationService, { args: [true] });
    modelSerializationService.registerClass('App', App);
    modelSerializationService.registerClass('TestAnchor', TestAnchor);
    modelSerializationService.registerClass('TestOverlay', TestOverlay);
  });

  afterEach(() => {
    Container.reset();
  });

  it('should not create duplicate anchors', async () => {
    const {
      app: [app],
    } = create({ app: ['test'] });
    const anchor1 = new TestAnchor('anchor-1', {}, app);
    app.addAnchor(anchor1);

    const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });
    expect(overlay1.getAnchors()).toHaveLength(1);

    overlay1.addAnchor(anchor1);
    expect(overlay1.getAnchors()).toHaveLength(1);
  });

  describe('addAnchor()', () => {
    it('should create dependency between overlay and anchor parents', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      // App to Overlay dependency.
      expect(app.getDependencies().map((d) => d.synth())).toMatchInlineSnapshot(`
       [
         {
           "behaviors": [
             {
               "forAction": "delete",
               "onAction": "delete",
               "onField": "MODEL_NAME",
               "toField": "overlayId",
             },
           ],
           "from": "app=test",
           "relationship": undefined,
           "to": "test-overlay=overlay-1",
         },
       ]
      `);

      // Overlay to App dependency.
      expect(overlay1.getDependencies().map((d) => d.synth())).toMatchInlineSnapshot(`
       [
         {
           "behaviors": [
             {
               "forAction": "add",
               "onAction": "add",
               "onField": "overlayId",
               "toField": "MODEL_NAME",
             },
             {
               "forAction": "update",
               "onAction": "add",
               "onField": "overlayId",
               "toField": "MODEL_NAME",
             },
           ],
           "from": "test-overlay=overlay-1",
           "relationship": undefined,
           "to": "app=test",
         },
       ]
      `);
    });
  });

  describe('diff()', () => {
    it('should produce an add diff', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      await createTestOverlays({ 'overlay-1': [] });

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "overlayId",
           "model": "test-overlay=overlay-1",
           "value": "overlay-1",
         },
       ]
      `);
    });

    it('should produce a delete diff', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);
      const overlayService = await Container.get(OverlayService);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [] });

      const overlay1_1 = await commit(overlay1);

      // Remove overlay.
      overlayService.removeOverlay(overlay1_1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "overlayId",
           "model": "test-overlay=overlay-1",
           "value": "overlay-1",
         },
       ]
      `);
    });

    it('should produce an update diff of flat properties', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [] });
      overlay1.properties['key1'] = 'value1';
      overlay1.properties['key2'] = 'value2';

      await commit(overlay1);

      // Update overlay properties.
      overlay1.properties['key2'] = 'value2.1';
      overlay1.properties['key3'] = 'value3';

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-overlay=overlay-1",
           "value": {
             "key": "key2",
             "value": "value2.1",
           },
         },
         {
           "action": "add",
           "field": "properties",
           "model": "test-overlay=overlay-1",
           "value": {
             "key": "key3",
             "value": "value3",
           },
         },
       ]
      `);
    });

    it('should produce an update diff of nested properties', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [] });
      overlay1.properties['key1'] = { 'key1.1': 'value1.1' };
      overlay1.properties['key2'] = { 'key2.1': 'value2.1' };

      await commit(overlay1);

      // Update overlay properties.
      overlay1.properties['key1'] = { 'key1.1': 'value1.3', 'key1.2': 'value1.2' };
      overlay1.properties['key2'] = { 'key2.1': 'value2.1' };

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-overlay=overlay-1",
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
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [] });
      overlay1.properties['key1'] = ['value1.1', 'value1.2'];

      await commit(overlay1);

      // Update overlay properties.
      overlay1.properties['key1'] = ['value1.3', 'value1.4'];

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "properties",
           "model": "test-overlay=overlay-1",
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
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [] });

      await commit(overlay1);

      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      // Add anchor.
      overlay1.addAnchor(anchor1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "anchor",
           "model": "test-overlay=overlay-1",
           "value": "anchorId=anchor-1",
         },
       ]
      `);
    });

    it('should not produce an update diff of anchors with no change', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      await commit(overlay1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should produce an update diff of anchors with flat properties', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      await commit(overlay1);

      // Update anchor properties.
      overlay1.getAnchor('anchor-1', app)!.properties['key2'] = 'value2';

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "anchor",
           "model": "test-overlay=overlay-1",
           "value": "anchorId=anchor-1",
         },
       ]
      `);
    });

    it('should produce an update diff of anchors with nested properties', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: { key2: 'value2' } }, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      await commit(overlay1);

      // Update anchor properties.
      overlay1.getAnchor('anchor-1', app)!.properties['key1'] = { key2: 'value3' };

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "anchor",
           "model": "test-overlay=overlay-1",
           "value": "anchorId=anchor-1",
         },
       ]
      `);
    });

    it('should produce a delete diff of anchors', async () => {
      const overlayDataRepository = await Container.get(OverlayDataRepository);

      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      await commit(overlay1);

      // Remove anchor.
      overlay1.removeAnchor(anchor1);

      const diffs = await overlayDataRepository.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "anchor",
           "model": "test-overlay=overlay-1",
           "value": "anchorId=anchor-1",
         },
       ]
      `);
    });
  });

  describe('remove()', () => {
    it('should be able to mark an overlay as deleted', async () => {
      const overlayService = await Container.get(OverlayService);

      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      await createTestOverlays({ 'overlay-1': [anchor1] });

      const overlay1 = overlayService.getOverlayById('overlay-1')!;
      overlay1.remove();

      expect(overlay1).not.toBe(undefined);
      expect(overlay1.isMarkedDeleted()).toBe(true);
      expect(overlayService.getOverlayById('overlay-1')).not.toBe(undefined);
    });

    it('should be able to completely remove an overlay from repository', async () => {
      const overlayService = await Container.get(OverlayService);

      const {
        app: [app],
      } = create({ app: ['test-app'] });
      const anchor1 = new TestAnchor('anchor-1', { key1: 'value1' }, app);
      app.addAnchor(anchor1);

      await createTestOverlays({ 'overlay-1': [anchor1] });

      const overlay1 = overlayService.getOverlayById('overlay-1')!;
      overlayService.removeOverlay(overlay1);

      expect(overlay1).not.toBe(undefined);
      expect(overlay1.isMarkedDeleted()).toBe(true);
      expect(overlayService.getOverlayById('overlay-1')).toBe(undefined);
    });
  });

  describe('removeAnchor()', () => {
    it('should remove dependency between overlay and anchor parents', async () => {
      const {
        app: [app1, app2],
      } = create({ app: ['test1', 'test2'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      expect(overlay1.getDependencies(app1)).toHaveLength(1);
      expect(overlay1.getDependencies(app2)).toHaveLength(1);

      overlay1.removeAnchor(anchor1);

      expect(overlay1.getDependencies(app1)).toHaveLength(0);
      expect(overlay1.getDependencies(app2)).toHaveLength(1);
    });

    it('should only remove one dependency with parent when multiple anchors have same parent', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      expect(overlay1.getAnchors()).toHaveLength(2);
      expect(app.getDependencies(overlay1)).toHaveLength(2);
      expect(overlay1.getDependencies(app)).toHaveLength(2);

      overlay1.removeAnchor(anchor1);

      expect(overlay1.getAnchors()).toHaveLength(1);
      expect(app.getDependencies(overlay1)).toHaveLength(1);
      expect(overlay1.getDependencies(app)).toHaveLength(1);
    });
  });

  describe('removeAllAnchors()', () => {
    it('should remove all anchors with parent dependencies', async () => {
      const {
        app: [app1, app2],
      } = create({ app: ['test1', 'test2'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app1);
      app1.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app2);
      app2.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });

      expect(overlay1.getAnchors()).toHaveLength(2);
      expect(app1.getDependencies()).toHaveLength(1);
      expect(app2.getDependencies()).toHaveLength(1);
      expect(overlay1.getDependencies()).toHaveLength(2);

      overlay1.removeAllAnchors();

      expect(overlay1.getAnchors()).toHaveLength(0);
      expect(app1.getDependencies()).toHaveLength(0);
      expect(app2.getDependencies()).toHaveLength(0);
      expect(overlay1.getDependencies()).toHaveLength(0);
    });
  });

  describe('synth()', () => {
    it('should be able to synth an empty overlay', async () => {
      const [overlay] = await createTestOverlays({ 'overlay-1': [] });

      expect(overlay.synth()).toMatchInlineSnapshot(`
        {
          "anchors": [],
          "overlayId": "overlay-1",
          "properties": {},
        }
      `);
    });

    it('should be able to synth with anchors', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });
      overlay1.properties['key1'] = 'value1';

      expect(overlay1.synth()).toMatchInlineSnapshot(`
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
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });
      overlay1.properties['key1'] = 'value1';

      const overlaySynth = overlay1.synth();

      const deReferenceContext = async (): Promise<App> => {
        const app = new App('test');
        app.addAnchor(anchor1);
        // Not adding anchor2, so overlay unSynth() can throw error.
        return app;
      };

      await expect(async () => {
        await AOverlay.unSynth(TestOverlay, overlaySynth, deReferenceContext);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Cannot find anchor while deserializing overlay!"`);
    });

    it('should be able to unSynth with anchors', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1, anchor2] });
      overlay1.properties['key1'] = 'value1';

      const overlaySynth = overlay1.synth();

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
