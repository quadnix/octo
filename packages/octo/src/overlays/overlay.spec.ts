import { TestAnchor, TestOverlay } from '../../test/helpers/test-classes.js';
import { App } from '../models/app/app.model.js';
import { AOverlay } from './overlay.abstract.js';

describe('Overlay UT', () => {
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
      const anchor1 = new TestAnchor('anchor-1', app);
      const anchor2 = new TestAnchor('anchor-2', app);
      const overlay = new TestOverlay('overlay-1', { key1: 'value1' }, [anchor1, anchor2]);

      expect(overlay.synth()).toMatchInlineSnapshot(`
        {
          "anchors": [
            {
              "anchorId": "anchor-1",
              "parent": {
                "context": "app=test",
              },
            },
            {
              "anchorId": "anchor-2",
              "parent": {
                "context": "app=test",
              },
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
      const anchor1 = new TestAnchor('anchor-1', app);
      const anchor2 = new TestAnchor('anchor-2', app);
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
      const anchor1 = new TestAnchor('anchor-1', app);
      const anchor2 = new TestAnchor('anchor-2', app);
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
