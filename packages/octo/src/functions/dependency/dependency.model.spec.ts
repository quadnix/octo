import { Environment } from '../../models/environment/environment.model.js';
import { Region } from '../../models/region/region.model.js';
import { DiffAction } from '../diff/diff.model.js';
import { Dependency } from './dependency.model.js';

describe('Dependency UT', () => {
  describe('addBehavior()', () => {
    it('should throw error when adding behavior on the wrong field (onField)', () => {
      expect(() => {
        const dependency = new Dependency(new Region('region-1'), new Environment('qa'));
        dependency.addBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD);
      }).toThrowErrorMatchingInlineSnapshot(`"Invalid field name is not a property of given model!"`);
    });

    it('should throw error when adding behavior on the wrong field (toField)', () => {
      expect(() => {
        const dependency = new Dependency(new Region('region-1'), new Environment('qa'));
        dependency.addBehavior('regionId', DiffAction.ADD, 'doesNotExist', DiffAction.ADD);
      }).toThrowErrorMatchingInlineSnapshot(`"Invalid field name is not a property of given model!"`);
    });
  });
});
