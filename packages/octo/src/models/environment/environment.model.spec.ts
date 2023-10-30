import 'reflect-metadata';

import { Environment } from './environment.model.js';

describe('Environment UT', () => {
  describe('diff()', () => {
    describe('when diff of environmentVariables', () => {
      it('should capture addition', async () => {
        const environment0 = new Environment('qa');

        const environment1 = new Environment('qa');
        environment1.environmentVariables.set('key', 'value');

        const diff = await environment1.diff(environment0);

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

      it('should capture update', async () => {
        const environment0 = new Environment('qa');
        environment0.environmentVariables.set('key', 'value 1');

        const environment1 = new Environment('qa');
        environment1.environmentVariables.set('key', 'value 2');

        const diff = await environment1.diff(environment0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "update",
            "field": "environmentVariables",
            "value": {
              "key": "key",
              "value": "value 2",
            },
          },
        ]
      `);
      });

      it('should capture replace', async () => {
        const environment0 = new Environment('qa');
        environment0.environmentVariables.set('key1', 'value 1');

        const environment1 = new Environment('qa');
        environment1.environmentVariables.set('key2', 'value 2');

        const diff = await environment1.diff(environment0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
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

      it('should capture deletion', async () => {
        const environment0 = new Environment('qa');
        environment0.environmentVariables.set('key', 'value');

        const environment1 = new Environment('qa');

        const diff = await environment1.diff(environment0);

        expect(diff).toMatchInlineSnapshot(`
        [
          {
            "action": "delete",
            "field": "environmentVariables",
            "value": {
              "key": "key",
              "value": "value",
            },
          },
        ]
      `);
      });

      it('should capture diff without a previous instance', async () => {
        const environment = new Environment('qa');
        environment.environmentVariables.set('key', 'value');

        const diff = await environment.diff();

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
    });
  });
});
