import { TestAnchor } from '../utilities/test-helpers/test-classes.js';
import { create } from '../utilities/test-helpers/test-models.js';

describe('Anchor UT', () => {
  it('should throw error adding an anchor twice to the same parent', () => {
    const {
      app: [app],
    } = create({ app: ['test'] });

    expect(() => {
      const anchor1_0 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1_0);
      const anchor1_1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1_1);
    }).toThrowErrorMatchingInlineSnapshot(`"Anchor already exists!"`);
  });

  describe('synth()', () => {
    it('should be able to synth an anchor', () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor = new TestAnchor('anchor-1', { key1: 'value-1' }, app);

      expect(anchor.synth()).toMatchInlineSnapshot(`
        {
          "anchorId": "anchor-1",
          "parent": {
            "context": "app=test",
            "type": "model",
          },
          "properties": {
            "key1": "value-1",
          },
        }
      `);
    });
  });

  describe('unSynth()', () => {
    it('should be able to unSynth an anchor', async () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const anchor = new TestAnchor('anchor-1', { key1: 'value-1' }, app);

      const deserializedAnchor = await TestAnchor.unSynth(TestAnchor, anchor.synth(), () => Promise.resolve(app));

      expect(deserializedAnchor.synth()).toMatchInlineSnapshot(`
        {
          "anchorId": "anchor-1",
          "parent": {
            "context": "app=test",
            "type": "model",
          },
          "properties": {
            "key1": "value-1",
          },
        }
      `);
    });
  });
});
