import { Environment } from '../environment/environment.model';
import { AwsRegion } from './aws/region.model';

describe('Region UT', () => {
  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      const t = (): void => {
        const region = new AwsRegion('aws-us-east-1');
        region.addEnvironment(new Environment('qa'));
        region.addEnvironment(new Environment('qa'));
      };
      expect(t).toThrow('Environment already exists!');
    });
  });

  describe('clone()', () => {
    it('should clone all fields', () => {
      const environment = new Environment('qa');
      const region = new AwsRegion('aws-us-east-1');
      region.addEnvironment(environment);

      const duplicate = region.clone();

      expect(duplicate.regionId).toBe(region.regionId);
      expect(duplicate.environments[0].environmentName).toBe(
        region.environments[0].environmentName,
      );
    });
  });

  describe('diff()', () => {
    it('should capture deletion of an environment', () => {
      const environment = new Environment('qa');
      const oldRegion = new AwsRegion('aws-us-east-1');
      oldRegion.addEnvironment(environment);
      const newRegion = new AwsRegion('aws-us-east-1');

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "field": "environment",
            "value": "qa",
          },
        ]
      `);
    });

    it('should capture update of an environment', () => {
      const oldEnvironment = new Environment('qa');
      const oldRegion = new AwsRegion('aws-us-east-1');
      oldRegion.addEnvironment(oldEnvironment);
      const newEnvironment = new Environment('qa');
      newEnvironment.environmentVariables.set('key', 'value');
      const newRegion = new AwsRegion('aws-us-east-1');
      newRegion.addEnvironment(newEnvironment);

      const diff = oldRegion.diff(newRegion);

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

    it('should capture addition of an environment', () => {
      const oldRegion = new AwsRegion('aws-us-east-1');
      const newEnvironment = new Environment('qa');
      const newRegion = new AwsRegion('aws-us-east-1');
      newRegion.addEnvironment(newEnvironment);

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "add",
            "field": "environment",
            "value": "qa",
          },
        ]
      `);
    });

    it('should capture replace of an environment', () => {
      const oldEnvironment = new Environment('qa');
      const oldRegion = new AwsRegion('aws-us-east-1');
      oldRegion.addEnvironment(oldEnvironment);
      const newEnvironment = new Environment('staging');
      const newRegion = new AwsRegion('aws-ap-south-1');
      newRegion.addEnvironment(newEnvironment);

      const diff = oldRegion.diff(newRegion);

      expect(diff).toMatchInlineSnapshot(`
        [
          Diff {
            "action": "delete",
            "field": "environment",
            "value": "qa",
          },
          Diff {
            "action": "add",
            "field": "environment",
            "value": "staging",
          },
        ]
      `);
    });
  });
});
