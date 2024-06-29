import { TestAnchor } from '../../test/helpers/test-classes.js';
import { create } from '../../test/helpers/test-models.js';

describe('Anchor UT', () => {
  it('should not be able to add an anchor twice to the same parent', () => {
    const {
      app: [app],
    } = create({ app: ['test'] });
    const anchor1_0 = new TestAnchor('anchor-1', {}, app);
    app.addAnchor(anchor1_0);
    const anchor1_1 = new TestAnchor('anchor-1', {}, app);
    app.addAnchor(anchor1_1);

    expect(app.getAnchors()).toHaveLength(1);
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
          },
          "properties": {
            "key1": "value-1",
          },
        }
      `);
    });
  });
});
