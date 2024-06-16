import { App } from '../../models/app/app.model.js';
import { Environment } from '../../models/environment/environment.model.js';
import { Region } from '../../models/region/region.model.js';
import { DiffAction } from '../diff/diff.js';
import { Dependency } from './dependency.js';

describe('Dependency UT', () => {
  describe('addBehavior()', () => {
    it('should add behavior on a non-existent field (onField)', () => {
      const dependency = new Dependency(new Region('region-1'), new Environment('qa'));
      dependency.addBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD)).toBe(
        true,
      );
    });

    it('should add behavior on a non-existent field (toField)', () => {
      const dependency = new Dependency(new Region('region-1'), new Environment('qa'));
      dependency.addBehavior('regionId', DiffAction.ADD, 'doesNotExist', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('regionId', DiffAction.ADD, 'doesNotExist', DiffAction.ADD)).toBe(true);
    });
  });

  describe('toJSON()', () => {
    it('should be able to JSON summarize a dependency', () => {
      const app = new App('app');
      const region = new Region('region-1');
      app.addRegion(region);
      const environment = new Environment('qa');
      region.addEnvironment(environment);

      const dependency = new Dependency(region, environment);

      expect(dependency.toJSON()).toMatchInlineSnapshot(`
        {
          "from": "region=region-1,app=app",
          "relationship": undefined,
          "to": "environment=qa,region=region-1,app=app",
        }
      `);
    });
  });
});
