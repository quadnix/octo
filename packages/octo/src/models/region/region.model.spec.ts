import { App } from '../app/app.model.js';
import { Environment } from '../environment/environment.model.js';
import { Region } from './region.model.js';

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

  describe('diff()', () => {
    describe('when diff of environment', () => {
      it('should capture addition', async () => {
        const app_1 = new App('test');
        const region_1 = new Region('region-1');
        app_1.addRegion(region_1);

        const app = new App('test');
        const region = new Region('region-1');
        app.addRegion(region);
        const environment = new Environment('qa');
        environment.environmentVariables.set('key1', 'value 1');
        environment.environmentVariables.set('key2', 'value 2');
        region.addEnvironment(environment);

        const diff = await region.diff(region_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentName",
            "value": "qa",
          },
        ]
      `);
      });

      it('should capture update', async () => {
        const app_1 = new App('test');
        const region_1 = new Region('region-1');
        app_1.addRegion(region_1);
        region_1.addEnvironment(new Environment('qa'));

        const app = new App('test');
        const region = new Region('region-1');
        app.addRegion(region);
        const environment = new Environment('qa');
        environment.environmentVariables.set('key', 'value');
        region.addEnvironment(environment);

        const diff = await region.diff(region_1);

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
        const app_1 = new App('test');
        const region_1 = new Region('region-1');
        app_1.addRegion(region_1);
        region_1.addEnvironment(new Environment('qa'));

        const app = new App('test');
        const region = new Region('aws-ap-south-1');
        app.addRegion(region);
        region.addEnvironment(new Environment('staging'));

        const diff = await region.diff(region_1);

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
        const app_1 = new App('test');
        const region_1 = new Region('region-1');
        app_1.addRegion(region_1);
        region_1.addEnvironment(new Environment('qa'));

        const app = new App('test');
        const region = new Region('region-1');
        app.addRegion(region);

        const diff = await region.diff(region_1);

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
        const app = new App('test');
        const region = new Region('region-1');
        app.addRegion(region);
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
            "field": "regionId",
            "value": "region-1",
          },
        ]
      `);
      });
    });
  });
});
