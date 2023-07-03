import { Environment } from '../environment/environment.model';
import { Region } from './region.model';

describe('Region UT', () => {
  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      const t = (): void => {
        const region = new Region('region-1');
        region.addEnvironment(new Environment('qa'));
        region.addEnvironment(new Environment('qa'));
      };
      expect(t).toThrow('Environment already exists!');
    });
  });

  describe('clone()', () => {
    it('should clone all fields', () => {
      const region = new Region('region-1');
      region.addEnvironment(new Environment('qa'));

      const duplicate = region.clone();

      expect(duplicate.regionId).toBe('region-1');
      expect(duplicate.environments[0].environmentName).toBe('qa');
    });
  });

  describe('diff()', () => {
    describe('when diff of environment', () => {
      it('should capture update', () => {
        const oldRegion = new Region('region-1');
        oldRegion.addEnvironment(new Environment('qa'));

        const newRegion = new Region('region-1');
        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value');
        newRegion.addEnvironment(newEnvironment);

        const diff = newRegion.diff(oldRegion);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentVariables",
            "value": {
              "key": "key",
              "value": "value",
            },
          },
        ]
      `);
      });

      it('should capture deletion', () => {
        const oldRegion = new Region('region-1');
        oldRegion.addEnvironment(new Environment('qa'));

        const newRegion = new Region('region-1');

        const diff = newRegion.diff(oldRegion);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environments",
            "value": "qa",
          },
        ]
      `);
      });

      it('should capture addition', () => {
        const oldRegion = new Region('region-1');

        const newRegion = new Region('region-1');
        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key1', 'value 1');
        newEnvironment.environmentVariables.set('key2', 'value 2');
        newRegion.addEnvironment(newEnvironment);

        const diff = newRegion.diff(oldRegion);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environments",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "value": {
              "key": "key1",
              "value": "value 1",
            },
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "value": {
              "key": "key2",
              "value": "value 2",
            },
          },
        ]
      `);
      });

      it('should capture replace', () => {
        const oldRegion = new Region('region-1');
        oldRegion.addEnvironment(new Environment('qa'));

        const newRegion = new Region('aws-ap-south-1');
        newRegion.addEnvironment(new Environment('staging'));

        const diff = newRegion.diff(oldRegion);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environments",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "environments",
            "value": "staging",
          },
        ]
      `);
      });

      it('should capture diff without a previous instance', () => {
        const newRegion = new Region('region-1');
        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key1', 'value 1');
        newEnvironment.environmentVariables.set('key2', 'value 2');
        newRegion.addEnvironment(newEnvironment);

        const diff = newRegion.diff();

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environments",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "value": {
              "key": "key1",
              "value": "value 1",
            },
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "value": {
              "key": "key2",
              "value": "value 2",
            },
          },
        ]
      `);
      });
    });
  });
});
