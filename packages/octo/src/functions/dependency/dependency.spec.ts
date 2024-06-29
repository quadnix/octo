import { create } from '../../../test/helpers/test-models.js';
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

  describe('synth()', () => {
    it('should be able to synth a dependency', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ app: ['app'], environment: ['qa'], region: ['region-1'] });

      const dependency = new Dependency(region, environment);

      expect(dependency.synth()).toMatchInlineSnapshot(`
        {
          "behaviors": [],
          "from": "region=region-1,app=app",
          "relationship": undefined,
          "to": "environment=qa,region=region-1,app=app",
        }
      `);
    });
  });
});
