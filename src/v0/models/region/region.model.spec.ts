import { App } from '../app/app.model';
import { Environment } from '../environment/environment.model';
import { AwsRegion } from './aws/region.model';

describe('Region UT', () => {
  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      const t = (): void => {
        const region = new AwsRegion(new App('test'), 'aws-us-east-1');
        region.addEnvironment(new Environment(region, 'qa'));
        region.addEnvironment(new Environment(region, 'qa'));
      };
      expect(t).toThrow('Environment already exists!');
    });
  });

  describe('clone()', () => {
    it('should clone all fields', () => {
      const region = new AwsRegion(new App('test'), 'aws-us-east-1');
      region.addEnvironment(new Environment(region, 'qa'));

      const duplicate = region.clone();

      expect(duplicate.getContext()).toBe('region=aws-us-east-1,app=test');
      expect(duplicate.regionId).toBe('aws-us-east-1');
      expect(duplicate.environments[0].environmentName).toBe('qa');
    });
  });

  describe('diff()', () => {
    it('should capture deletion of an environment', () => {
      const oldRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      oldRegion.addEnvironment(new Environment(oldRegion, 'qa'));
      const newRegion = new AwsRegion(new App('test'), 'aws-us-east-1');

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "context": "region=aws-us-east-1,app=test",
            "field": "environment",
            "value": "qa",
          },
        ]
      `);
    });

    it('should capture update of an environment', () => {
      const oldRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      oldRegion.addEnvironment(new Environment(oldRegion, 'qa'));
      const newRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      const newEnvironment = new Environment(newRegion, 'qa');
      newEnvironment.environmentVariables.set('key', 'value');
      newRegion.addEnvironment(newEnvironment);

      const diff = oldRegion.diff(newRegion);

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

    it('should capture addition of an environment', () => {
      const oldRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      const newRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      newRegion.addEnvironment(new Environment(newRegion, 'qa'));

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "add",
            "context": "region=aws-us-east-1,app=test",
            "field": "environment",
            "value": "qa",
          },
        ]
      `);
    });

    it('should capture replace of an environment', () => {
      const oldRegion = new AwsRegion(new App('test'), 'aws-us-east-1');
      oldRegion.addEnvironment(new Environment(oldRegion, 'qa'));
      const newRegion = new AwsRegion(new App('test'), 'aws-ap-south-1');
      newRegion.addEnvironment(new Environment(newRegion, 'staging'));

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "context": "region=aws-us-east-1,app=test",
            "field": "environment",
            "value": "qa",
          },
          Diff {
            "action": "add",
            "context": "region=aws-us-east-1,app=test",
            "field": "environment",
            "value": "staging",
          },
        ]
      `);
    });
  });
});
