import { App } from '../app/app.model';
import { AwsRegion } from '../region/aws/region.model';
import { Environment } from './environment.model';

describe('Environment UT', () => {
  describe('clone()', () => {
    it('should clone all fields', () => {
      const environment = new Environment(
        new AwsRegion(new App('test'), 'aws-us-east-1'),
        'qa',
      );
      environment.environmentVariables.set('key', 'value');

      const duplicate = environment.clone();

      expect(duplicate.getContext()).toBe(
        'environment=qa,region=aws-us-east-1,app=test',
      );
      expect(duplicate.environmentName).toBe('qa');
      expect(duplicate.environmentVariables.get('key')).toBe('value');
    });
  });

  describe('diff()', () => {
    it('should capture deletion of environmentVariables', () => {
      const region = new AwsRegion(new App('test'), 'aws-us-east-1');
      const oldEnvironment = new Environment(region, 'qa');
      oldEnvironment.environmentVariables.set('key', 'value');
      const newEnvironment = new Environment(region, 'qa');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "context": "environment=qa,region=aws-us-east-1,app=test",
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
      const region = new AwsRegion(new App('test'), 'aws-us-east-1');
      const oldEnvironment = new Environment(region, 'qa');
      oldEnvironment.environmentVariables.set('key', 'value 1');
      const newEnvironment = new Environment(region, 'qa');
      newEnvironment.environmentVariables.set('key', 'value 2');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "update",
            "context": "environment=qa,region=aws-us-east-1,app=test",
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
      const region = new AwsRegion(new App('test'), 'aws-us-east-1');
      const oldEnvironment = new Environment(region, 'qa');
      const newEnvironment = new Environment(region, 'qa');
      newEnvironment.environmentVariables.set('key', 'value');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "add",
            "context": "environment=qa,region=aws-us-east-1,app=test",
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
      const region = new AwsRegion(new App('test'), 'aws-us-east-1');
      const oldEnvironment = new Environment(region, 'qa');
      oldEnvironment.environmentVariables.set('key1', 'value 1');
      const newEnvironment = new Environment(region, 'qa');
      newEnvironment.environmentVariables.set('key2', 'value 2');

      const diff = oldEnvironment.diff(newEnvironment);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "context": "environment=qa,region=aws-us-east-1,app=test",
            "field": "environmentVariables",
            "value": {
              "key": "key1",
              "value": "value 1",
            },
          },
          Diff {
            "action": "add",
            "context": "environment=qa,region=aws-us-east-1,app=test",
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