import { commit, create } from '../../../test/helpers/test-models.js';
import { type Region } from '../region/region.model.js';
import { type Environment } from './environment.model.js';

describe('Environment UT', () => {
  describe('diff()', () => {
    describe('when diff of environmentVariables', () => {
      it('should capture addition', async () => {
        const {
          app: [app],
          environment: [environment],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
        const environment_1 = region_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;

        // Update environment variables.
        environment.environmentVariables.set('key1', 'value1');
        environment.environmentVariables.set('key2', 'value2');

        const diff = await environment.diff(environment_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "add",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key1",
              "value": "value1",
            },
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key2",
              "value": "value2",
            },
          },
        ]
      `);
      });

      it('should capture update', async () => {
        const {
          app: [app],
          environment: [environment],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
        environment.environmentVariables.set('key', 'value 1');

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
        const environment_1 = region_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;

        // Update environment variables.
        environment.environmentVariables.set('key', 'value 2');

        const diff = await environment.diff(environment_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "update",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key",
              "value": "value 2",
            },
          },
        ]
      `);
      });

      it('should capture replace', async () => {
        const {
          app: [app],
          environment: [environment],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
        environment.environmentVariables.set('key1', 'value 1');

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
        const environment_1 = region_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;

        // Update environment variables.
        environment.environmentVariables.delete('key1');
        environment.environmentVariables.set('key2', 'value 2');

        const diff = await environment.diff(environment_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key1",
              "value": "value 1",
            },
          },
          {
            "action": "add",
            "field": "environmentVariables",
            "model": "environment=qa,region=region-1,app=test",
            "value": {
              "key": "key2",
              "value": "value 2",
            },
          },
        ]
      `);
      });

      it('should capture deletion', async () => {
        const {
          app: [app],
          environment: [environment],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
        environment.environmentVariables.set('key', 'value');

        const app_1 = await commit(app);
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
        const environment_1 = region_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;

        // Update environment variables.
        environment.environmentVariables.delete('key');

        const diff = await environment.diff(environment_1);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
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

      it('should capture diff without a previous instance', async () => {
        const {
          environment: [environment],
        } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });
        environment.environmentVariables.set('key1', 'value 1');

        const diff = await environment.diff();

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
    });
  });
});
