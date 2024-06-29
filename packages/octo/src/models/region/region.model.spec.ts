import { commit, create } from '../../../test/helpers/test-models.js';
import { Environment } from '../environment/environment.model.js';
import { type Region } from './region.model.js';

describe('Region UT', () => {
  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      const t = (): void => {
        create({ app: ['test'], environment: ['qa', 'qa:-1'], region: ['region-1'] });
      };
      expect(t).toThrow('Environment already exists!');
    });
  });

  describe('diff()', () => {
    describe('when diff of environment', () => {
      it('should capture addition', async () => {
        const {
          app: [app],
          region: [region],
        } = create({ app: ['test'], region: ['region-1'] });

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;

        // Add environment.
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
            "model": "environment=qa,region=region-1,app=test",
            "value": "qa",
          },
        ]
      `);
      });

      it('should capture update', async () => {
        const {
          app: [app],
          environment: [environment],
          region: [region],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;

        // Update environment.
        environment.environmentVariables.set('key', 'value');

        const diff = await region.diff(region_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key",
              "value": "value",
            },
          },
        ]
      `);
      });

      it('should capture replace', async () => {
        const {
          app: [app],
          environment: [environment1],
          region: [region],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;

        // Replace qa environment with staging.
        environment1.remove();
        const environment2 = new Environment('staging');
        region.addEnvironment(environment2);

        const diff = await region.diff(region_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentName",
            "model": "environment=qa,region=region-1,app=test",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "environmentName",
            "model": "environment=staging,region=region-1,app=test",
            "value": "staging",
          },
        ]
      `);
      });

      it('should capture deletion', async () => {
        const {
          app: [app],
          environment: [environment1],
          region: [region],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;

        // Delete environment.
        environment1.remove();

        const diff = await region.diff(region_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentName",
            "model": "environment=qa,region=region-1,app=test",
            "value": "qa",
          },
        ]
      `);
      });

      it('should capture diff without a previous instance', async () => {
        const {
          environment: [environment],
          region: [region],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
        environment.environmentVariables.set('key1', 'value 1');
        environment.environmentVariables.set('key2', 'value 2');

        const diff = await region.diff();

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentName",
            "model": "environment=qa,region=region-1,app=test",
            "value": "qa",
          },
          {
            "action": "add",
            "field": "regionId",
            "model": "region=region-1,app=test",
            "value": "region-1",
          },
        ]
      `);
      });
    });
  });
});
