import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { DiffAction } from '../diff/diff.model';
import { Dependency } from './dependency.model';

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
