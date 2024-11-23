import { create } from '../../../test/helpers/test-models.js';
import { DiffAction } from '../diff/diff.js';
import { Dependency } from './dependency.js';

describe('Dependency UT', () => {
  describe('addBehavior()', () => {
    it('should add behavior on a non-existent field (onField)', () => {
      const {
        app: [app],
        region: [region],
      } = create({ account: ['account'], app: ['app'], region: ['region-1'] });

      const dependency = new Dependency(app, region);

      dependency.addBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD)).toBe(
        true,
      );
    });

    it('should add behavior on a non-existent field (toField)', () => {
      const {
        app: [app],
        region: [region],
      } = create({ account: ['account'], app: ['app'], region: ['region-1'] });

      const dependency = new Dependency(app, region);

      dependency.addBehavior('regionId', DiffAction.ADD, 'doesNotExist', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('regionId', DiffAction.ADD, 'doesNotExist', DiffAction.ADD)).toBe(true);
    });
  });

  describe('removeBehavior()', () => {
    it('should throw error trying to remove non-existent behavior', () => {
      const {
        app: [app],
        region: [region],
      } = create({ account: ['account'], app: ['app'], region: ['region-1'] });

      const dependency = new Dependency(app, region);

      expect(() => {
        dependency.removeBehavior('doesNotExist', DiffAction.ADD, 'environmentName', DiffAction.ADD);
      }).toThrow('Dependency behavior not found!');
    });

    it('should be able to remove behavior', () => {
      const {
        app: [app],
        region: [region],
      } = create({ account: ['account'], app: ['app'], region: ['region-1'] });

      const dependency = new Dependency(app, region);

      dependency.addBehavior('name', DiffAction.ADD, 'regionId', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('name', DiffAction.ADD, 'regionId', DiffAction.ADD)).toBe(true);

      dependency.removeBehavior('name', DiffAction.ADD, 'regionId', DiffAction.ADD);
      expect(dependency.hasMatchingBehavior('name', DiffAction.ADD, 'regionId', DiffAction.ADD)).toBe(false);
    });
  });

  describe('synth()', () => {
    it('should be able to synth a dependency', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['account'], app: ['app'], environment: ['qa'], region: ['region-1'] });

      const dependency = new Dependency(region, environment);

      expect(dependency.synth()).toMatchInlineSnapshot(`
        {
          "behaviors": [],
          "from": "region=region-1,account=account,app=app",
          "relationship": undefined,
          "to": "environment=qa,region=region-1,account=account,app=app",
        }
      `);
    });
  });

  describe('unSynth()', () => {
    it('should be able to unSynth a dependency', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['account'], app: ['app'], environment: ['qa'], region: ['region-1'] });

      const dependency = new Dependency(region, environment);
      const dependencySynth = dependency.synth();

      const dependencyUnSynth = Dependency.unSynth(region, environment, dependencySynth);
      expect(dependency.isEqual(dependencyUnSynth)).toBe(true);
    });
  });
});
