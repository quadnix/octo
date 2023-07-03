import { Environment } from './environment.model';

describe('Environment UT', () => {
  describe('clone()', () => {
    it('should clone all fields', () => {
      const environment = new Environment('qa');
      environment.environmentVariables.set('key', 'value');

      const duplicate = environment.clone();

      expect(duplicate.environmentName).toBe('qa');
      expect(duplicate.environmentVariables.get('key')).toBe('value');
    });
  });

  describe('diff()', () => {
    describe('when diff of environmentVariables', () => {
      it('should capture update', () => {
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key', 'value 1');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value 2');

        const diff = newEnvironment.diff(oldEnvironment);

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

      it('should capture deletion', () => {
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key', 'value');

        const newEnvironment = new Environment('qa');

        const diff = newEnvironment.diff(oldEnvironment);

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

      it('should capture addition', () => {
        const oldEnvironment = new Environment('qa');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value');

        const diff = newEnvironment.diff(oldEnvironment);

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

      it('should capture replace', () => {
        const oldEnvironment = new Environment('qa');
        oldEnvironment.environmentVariables.set('key1', 'value 1');

        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key2', 'value 2');

        const diff = newEnvironment.diff(oldEnvironment);

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

      it('should capture diff without a previous instance', () => {
        const newEnvironment = new Environment('qa');
        newEnvironment.environmentVariables.set('key', 'value');

        const diff = newEnvironment.diff();

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
