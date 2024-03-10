import { UnknownModel } from '../app.type.js';
import { App } from '../models/app/app.model.js';
import { AAnchor } from './anchor.abstract.js';

class TestAnchor extends AAnchor {
  constructor(anchorId: string, parent: UnknownModel) {
    super(anchorId, parent);
  }
}

describe('Anchor UT', () => {
  describe('synth()', () => {
    it('should be able to synth an anchor', () => {
      const app = new App('test');
      const anchor = new TestAnchor('anchor-1', app);

      expect(anchor.synth()).toMatchInlineSnapshot(`
        {
          "anchorId": "anchor-1",
          "parent": {
            "context": "app=test",
          },
        }
      `);
    });
  });

  describe('toJSON()', () => {
    it('should be able to JSON summarize an anchor', () => {
      const app = new App('test');
      const anchor = new TestAnchor('anchor-1', app);

      expect(anchor.toJSON()).toMatchInlineSnapshot(`
        {
          "anchorId": "anchor-1",
          "parent": "app=test",
        }
      `);
    });
  });
});
