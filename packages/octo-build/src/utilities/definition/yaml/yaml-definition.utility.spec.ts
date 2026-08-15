import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { YamlDefinitionUtility } from './yaml-definition.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => join(__dirname, '..', '..', '..', '..', 'test', 'resources', name);

describe('YamlDefinitionUtility UT', () => {
  describe('resolveEnvironmentValue()', () => {
    const environmentKeys = ['OCTO_TEST_BOOLEAN_TRUE', 'OCTO_TEST_BOOLEAN_FALSE', 'OCTO_TEST_NUMBER'];

    afterEach(() => {
      for (const key of environmentKeys) {
        delete process.env[key];
      }
    });

    it('should resolve a boolean from its yaml default', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_BOOLEAN_TRUE}')).toBe(true);
      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_BOOLEAN_FALSE}')).toBe(false);
    });

    it('should resolve a shell-supplied "false" to false, not to true', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      process.env.OCTO_TEST_BOOLEAN_TRUE = 'false';
      process.env.OCTO_TEST_BOOLEAN_FALSE = 'TRUE';

      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_BOOLEAN_TRUE}')).toBe(false);
      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_BOOLEAN_FALSE}')).toBe(true);
    });

    it('should reject a value that is not a boolean', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      process.env.OCTO_TEST_BOOLEAN_TRUE = 'yes';

      expect(() => definition.resolveEnvironmentValue('${env.OCTO_TEST_BOOLEAN_TRUE}')).toThrow(
        'Value "yes" for key "OCTO_TEST_BOOLEAN_TRUE" is not a boolean!',
      );
    });

    it('should resolve numbers and strings', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_NUMBER}')).toBe(42);
      expect(definition.resolveEnvironmentValue('${env.OCTO_TEST_STRING}')).toBe('hello');
    });

    it('should report a missing key when the definition declares no "env" block', () => {
      const definition = new YamlDefinitionUtility(fixture('terraform-minimal-definition.yml'));

      expect(() => definition.resolveEnvironmentValue('${env.DOES_NOT_EXIST}')).toThrow(
        'Key "DOES_NOT_EXIST" not found under "env"!',
      );
    });
  });

  describe('resolveImports()', () => {
    const projectRoot = join(__dirname, '..', '..', '..', '..');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should resolve a bare specifier from the project root', async () => {
      jest.spyOn(process, 'cwd').mockReturnValue(projectRoot);
      const definition = new YamlDefinitionUtility(fixture('bare-import-definition.yml'));

      const imports = await definition.resolveImports();

      expect(imports).toHaveLength(1);
      expect(imports[0].className.name).toBe('Octo');
    });

    // That a bare specifier is anchored to the project root rather than to octo-build's own install
    // directory cannot be asserted here: jest's module registry resolves `createRequire()` through
    // its own resolver from `rootDir`, ignoring the filename it is handed. Only a real node process
    // exercises the anchoring.

    it('should report the specifier as written when it cannot be found', async () => {
      const definition = new YamlDefinitionUtility(fixture('missing-import-definition.yml'));

      await expect(definition.resolveImports()).rejects.toThrow('Failed to import path "@quadnix/does-not-exist"');
    });
  });

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
