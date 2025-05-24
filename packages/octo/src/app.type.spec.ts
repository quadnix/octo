import { MatchingResource } from './app.type.js';
import type { BaseResourceSchema } from './resources/resource.schema.js';
import { TestResource } from './utilities/test-helpers/test-classes.js';

describe('AppType UT', () => {
  describe('MatchingResource UT', () => {
    describe('addChild()', () => {
      it('should add matching resource parent to the parents list', async () => {
        const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
        const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));
        const resource3 = new MatchingResource(new TestResource('resource-3', {}, []));

        resource1.addChild('resourceId', resource3.getActual(), 'resourceId');
        resource2.addChild('resourceId', resource3.getActual(), 'resourceId');

        expect(resource3.getActual().parents.map((p: MatchingResource<BaseResourceSchema>) => p.getActual().resourceId))
          .toMatchInlineSnapshot(`
          [
            "resource-1",
            "resource-2",
          ]
        `);
      });

      it('should skip adding matching resource parent to the parents list that already exists', async () => {
        const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
        const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));
        const resource3 = new MatchingResource(new TestResource('resource-3', {}, []));

        resource1.addChild('resourceId', resource3.getActual(), 'resourceId');
        resource2.addChild('resourceId', resource3.getActual(), 'resourceId');
        resource1.addChild('resourceId', resource3.getActual(), 'resourceId');

        expect(resource3.getActual().parents.map((p: MatchingResource<BaseResourceSchema>) => p.getActual().resourceId))
          .toMatchInlineSnapshot(`
          [
            "resource-1",
            "resource-2",
          ]
        `);
      });
    });
  });
});
