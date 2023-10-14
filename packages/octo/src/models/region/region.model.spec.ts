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
      expect(t).toThrowError('Environment already exists!');
    });
  });

  describe('diff()', () => {
    describe('when diff of environment', () => {
      it('should capture addition', async () => {
        const region0 = new Region('region-1');

        const region1 = new Region('region-1');
        const environment1 = new Environment('qa');
        environment1.environmentVariables.set('key1', 'value 1');
        environment1.environmentVariables.set('key2', 'value 2');
        region1.addEnvironment(environment1);

        const diff = await region1.diff(region0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentName",
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

      it('should capture update', async () => {
        const region0 = new Region('region-1');
        region0.addEnvironment(new Environment('qa'));

        const region1 = new Region('region-1');
        const environment1 = new Environment('qa');
        environment1.environmentVariables.set('key', 'value');
        region1.addEnvironment(environment1);

        const diff = await region1.diff(region0);

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

      it('should capture replace', async () => {
        const region0 = new Region('region-1');
        region0.addEnvironment(new Environment('qa'));

        const region1 = new Region('aws-ap-south-1');
        region1.addEnvironment(new Environment('staging'));

        const diff = await region1.diff(region0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentName",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "environmentName",
            "value": "staging",
          },
        ]
      `);
      });

      it('should capture deletion', async () => {
        const region0 = new Region('region-1');
        region0.addEnvironment(new Environment('qa'));

        const region1 = new Region('region-1');

        const diff = await region1.diff(region0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentName",
            "value": "qa",
          },
        ]
      `);
      });

      it('should capture diff without a previous instance', async () => {
        const region = new Region('region-1');
        const environment = new Environment('qa');
        environment.environmentVariables.set('key1', 'value 1');
        environment.environmentVariables.set('key2', 'value 2');
        region.addEnvironment(environment);

        const diff = await region.diff();

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentName",
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
