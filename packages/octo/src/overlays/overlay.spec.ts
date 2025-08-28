import { TestContainer } from '../functions/container/test-container.js';
import type { ANode } from '../functions/node/node.abstract.js';
import { App } from '../models/app/app.model.js';
import { TestAnchor, TestOverlay } from '../utilities/test-helpers/test-classes.js';
import { create } from '../utilities/test-helpers/test-models.js';
import { createTestOverlays } from '../utilities/test-helpers/test-overlays.js';
import { AOverlay } from './overlay.abstract.js';

describe('Overlay UT', () => {
  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  it('should set context', async () => {
    const {
      app: [app],
    } = create({ app: ['test'] });
    const anchor1 = new TestAnchor('anchor-1', {}, app);
    app.addAnchor(anchor1);

    const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
      { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
    ]);

    expect(overlay1.getContext()).toBe('@octo/test-overlay=overlay-1');
  });

  describe('addAnchor()', () => {
    it('should throw error when parent field cannot be determined', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      // Ensure parent field cannot be calculated.
      // @ts-expect-error static members are readonly.
      (app.constructor as typeof ANode)['NODE_NAME'] = 'unknown';

      await expect(async () => {
        await createTestOverlays([{ anchors: [anchor1], context: '@octo/test-overlay=overlay-1' }]);
      }).rejects.toMatchInlineSnapshot(`[Error: Cannot derive anchor parent field!]`);

      // Reset app NODE_NAME
      // @ts-expect-error static members are readonly.
      (app.constructor as typeof ANode)['NODE_NAME'] = 'app';
    });

    it('should throw error creating duplicate anchors', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);
      expect(overlay1.getAnchors()).toHaveLength(1);

      expect(() => {
        overlay1.addAnchor(anchor1);
      }).toThrowErrorMatchingInlineSnapshot(`"Anchor already exists!"`);
    });

    it('should create dependency between overlay and anchor parents', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);

      // App to Overlay dependency.
      expect(app.getSiblings()['test-overlay'].map((d) => d.synth())).toMatchInlineSnapshot(`
       [
         {
           "behaviors": [
             {
               "forAction": "delete",
               "onAction": "delete",
               "onField": "name",
               "toField": "overlayId",
             },
           ],
           "from": "app=test",
           "relationship": undefined,
           "to": "@octo/test-overlay=overlay-1",
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
               "toField": "name",
             },
             {
               "forAction": "update",
               "onAction": "add",
               "onField": "overlayId",
               "toField": "name",
             },
           ],
           "from": "@octo/test-overlay=overlay-1",
           "relationship": undefined,
           "to": "app=test",
         },
       ]
      `);
    });
  });

  describe('diff()', () => {
    it('should produce an add diff for an anchor', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);

      const diffs = await overlay1.diff();
      expect(diffs).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "anchor",
           "node": "@octo/test-overlay=overlay-1",
           "value": "anchorId=anchor-1",
         },
       ]
      `);
    });

    it('should not produce any diff for properties', async () => {
      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [], context: '@octo/test-overlay=overlay-1' },
      ]);
      overlay1.properties.key1 = 'value1';

      const diffs = await overlay1.diff();
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('getAnchor()', () => {
    it('should return an anchor', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);
      expect(overlay1.getAnchor('anchor-1', app)).toBe(anchor1);
    });
  });

  describe('getAnchorIndex()', () => {
    it('should return the anchor index', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);
      expect(overlay1.getAnchorIndex('anchor-1', app)).toBeGreaterThan(-1);
    });
  });

  describe('removeAnchor()', () => {
    it('should not remove an anchor that is not in the overlay', async () => {
      const {
        app: [app],
      } = create({ app: ['test1'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(overlay1.getAnchors().length).toBe(1);

      overlay1.removeAnchor(anchor2);

      expect(overlay1.getAnchors().length).toBe(1);
    });

    it('should remove dependency between overlay and anchor parents', async () => {
      const {
        app: [app],
      } = create({ app: ['test1'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(app.getSiblings()['test-overlay'].length).toBe(1);
      expect(overlay1.getSiblings()['app'].length).toBe(1);

      overlay1.removeAnchor(anchor1);

      expect(app.getSiblings()['test-overlay']).toBeUndefined();
      expect(overlay1.getSiblings()['app']).toBeUndefined();
    });

    it('should only remove one dependency with parent when multiple anchors have same parent', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1, anchor2], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(app.getSiblings()['test-overlay'].length).toBe(2);
      expect(overlay1.getSiblings()['app'].length).toBe(2);

      overlay1.removeAnchor(anchor1);

      expect(app.getSiblings()['test-overlay'].length).toBe(1);
      expect(overlay1.getSiblings()['app'].length).toBe(1);
    });
  });

  describe('removeAllAnchors()', () => {
    it('should remove all anchors with parent dependencies', async () => {
      const {
        app: [app],
      } = create({ account: ['aws,account'], app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1, anchor2], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(app.getSiblings()['test-overlay'].length).toBe(2);
      expect(overlay1.getSiblings()['app'].length).toBe(2);

      overlay1.removeAllAnchors();

      expect(app.getSiblings()['test-overlay']).toBeUndefined();
      expect(overlay1.getSiblings()['app']).toBeUndefined();
    });
  });

  describe('synth()', () => {
    it('should be able to synth an empty overlay', async () => {
      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [], context: '@octo/test-overlay=overlay-1' },
      ]);

      expect(overlay1.synth()).toMatchInlineSnapshot(`
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
      } = create({ account: ['aws,account'], app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1, anchor2], context: '@octo/test-overlay=overlay-1' },
      ]);
      overlay1.properties['key1'] = 'value1';

      expect(overlay1.synth()).toMatchInlineSnapshot(`
        {
          "anchors": [
            {
              "anchorId": "anchor-1",
              "parent": {
                "context": "app=test",
                "type": "model",
              },
              "properties": {},
            },
            {
              "anchorId": "anchor-2",
              "parent": {
                "context": "app=test",
                "type": "model",
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
      } = create({ account: ['aws,account'], app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1, anchor2], context: '@octo/test-overlay=overlay-1' },
      ]);
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
      } = create({ account: ['aws,account'], app: ['test'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);
      const anchor2 = new TestAnchor('anchor-2', {}, app);
      app.addAnchor(anchor2);

      const { '@octo/test-overlay=overlay-1': overlay1 } = await createTestOverlays([
        { anchors: [anchor1, anchor2], context: '@octo/test-overlay=overlay-1' },
      ]);
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
