import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { YamlDefinitionUtility } from './yaml-definition.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => join(__dirname, '..', '..', '..', '..', 'test', 'resources', name);

describe('YamlDefinitionUtility UT', () => {
  describe('resolveTerraformOptions()', () => {
    it('should parse the terraform section, defaulting and env-resolving providers', () => {
      const definition = new YamlDefinitionUtility(fixture('terraform-definition.yml'));
      const terraform = definition.resolveTerraformOptions();

      expect(terraform.requiredVersion).toBe('1.6.0');
      expect(terraform.requiredProviders).toEqual({
        aws: { minVersion: '5.0.0', source: 'hashicorp/aws' },
      });
      expect(terraform.providers).toEqual([
        {
          accountId: '111111111111',
          providerType: 'aws',
          regionId: 'us-east-1',
          setRegionAttribute: true, // defaulted
          spec: { profile: 'default' }, // env-resolved from ${env.AWS_PROFILE}
        },
        {
          accountId: '222222222222',
          providerType: 'aws',
          regionId: 'us-west-2',
          setRegionAttribute: false,
          spec: {},
        },
      ]);
    });

    it('should parse a minimal terraform block with empty providers and requiredProviders', () => {
      const definition = new YamlDefinitionUtility(fixture('terraform-minimal-definition.yml'));
      const terraform = definition.resolveTerraformOptions();

      expect(terraform.requiredVersion).toBe('1.6.0');
      expect(terraform.requiredProviders).toEqual({});
      expect(terraform.providers).toEqual([]);
    });
  });
});
