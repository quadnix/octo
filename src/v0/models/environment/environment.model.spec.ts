import { Environment } from './environment.model';

describe('Environment UT', () => {
  describe('clone()', () => {
    it('should clone all fields', () => {
      const environment = new Environment('qa');
      environment.environmentVariables.set('key', 'value');

      const duplicate = environment.clone();

      expect(duplicate.environmentName).toBe(environment.environmentName);
      expect(duplicate.environmentVariables.get('key')).toBe('value');
    });
  });

  describe('diff()', () => {
    it('should capture deletion of environmentVariables', () => {
      const oldEnvironment = new Environment('qa');
      oldEnvironment.environmentVariables.set('key', 'value');
      const newEnvironment = new Environment('qa');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
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

    it('should capture update of environmentVariables', () => {
      const oldEnvironment = new Environment('qa');
      oldEnvironment.environmentVariables.set('key', 'value 1');
      const newEnvironment = new Environment('qa');
      newEnvironment.environmentVariables.set('key', 'value 2');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
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

    it('should capture addition of environmentVariables', () => {
      const oldEnvironment = new Environment('qa');
      const newEnvironment = new Environment('qa');
      newEnvironment.environmentVariables.set('key', 'value');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
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

    it('should capture replace of environmentVariables', () => {
      const oldEnvironment = new Environment('qa');
      oldEnvironment.environmentVariables.set('key1', 'value 1');
      const newEnvironment = new Environment('qa');
      newEnvironment.environmentVariables.set('key2', 'value 2');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "field": "environmentVariables",
            "value": {
              "key": "key1",
              "value": "value 1",
            },
          },
          Diff {
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
