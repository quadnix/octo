import { Environment } from './environment.model';

describe('Environment UT', () => {
  describe('diff()', () => {
    describe('when diff of environmentVariables', () => {
      it('should capture update', async () => {
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key', 'value 1');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value 2');

        const diff = await newEnvironment.diff(oldEnvironment);

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

      it('should capture deletion', async () => {
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key', 'value');

        const newEnvironment = new Environment('qa');

        const diff = await newEnvironment.diff(oldEnvironment);

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

      it('should capture addition', async () => {
        const oldEnvironment = new Environment('qa');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value');

        const diff = await newEnvironment.diff(oldEnvironment);

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
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key1', 'value 1');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key2', 'value 2');

        const diff = await newEnvironment.diff(oldEnvironment);

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

      it('should capture diff without a previous instance', async () => {
        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value');

        const diff = await newEnvironment.diff();

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
