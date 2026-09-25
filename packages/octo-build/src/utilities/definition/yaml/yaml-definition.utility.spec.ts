import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
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

    it('should resolve a reference nested in an array of objects', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      expect(
        definition.resolveEnvironmentValue([
          { imageTag: '${env.OCTO_TEST_STRING}', replicas: '${env.OCTO_TEST_NUMBER}' },
          { imageTag: 'literal' },
        ]),
      ).toEqual([{ imageTag: 'hello', replicas: 42 }, { imageTag: 'literal' }]);
    });

    it('should resolve one node reached twice, which a YAML anchor produces', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));
      const shared = { imageTag: '${env.OCTO_TEST_STRING}' };

      expect(definition.resolveEnvironmentValue({ first: shared, second: shared })).toEqual({
        first: { imageTag: 'hello' },
        second: { imageTag: 'hello' },
      });
    });

    it('should report a value that contains itself', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));
      const cyclic: Record<string, unknown> = { imageTag: '${env.OCTO_TEST_STRING}' };
      cyclic.self = cyclic;

      expect(() => definition.resolveEnvironmentValue(cyclic)).toThrowErrorMatchingInlineSnapshot(
        `"Definition holds a value that contains itself!"`,
      );
    });

    it('should leave a value carrying no reference alone', () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      expect(definition.resolveEnvironmentValue({ a: [1, 'two', null], b: { c: true } })).toEqual({
        a: [1, 'two', null],
        b: { c: true },
      });
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

  describe('resolveListeners()', () => {
    let originalStdoutIsTerminal: boolean | undefined;

    beforeEach(() => {
      originalStdoutIsTerminal = process.stdout.isTTY;
    });

    afterEach(() => {
      process.stdout.isTTY = originalStdoutIsTerminal as boolean;
    });

    it('should default colorize to whether the destination is a terminal', async () => {
      const definition = new YamlDefinitionUtility(fixture('env-kinds-definition.yml'));

      process.stdout.isTTY = false;
      const whenRedirected = await definition.resolveListeners();
      expect((whenRedirected[0].args![0] as { colorize: boolean }).colorize).toBe(false);

      process.stdout.isTTY = true;
      const whenATerminal = await definition.resolveListeners();
      expect((whenATerminal[0].args![0] as { colorize: boolean }).colorize).toBe(true);
    });
  });

  describe('resolveStateCheckInIntervalInMs()', () => {
    it.each([
      [4, 'must be >= 5'],
      [61, 'must be <= 60'],
    ])('should throw on an interval of %i seconds', async (seconds, failure) => {
      const definitionFilePath = join(await mkdtemp(join(tmpdir(), 'octo-definition-')), 'octo.yml');
      const definition = await readFile(fixture('remote-state-definition.yml'), 'utf-8');
      await writeFile(
        definitionFilePath,
        definition.replace('checkInIntervalInSeconds: 30', `checkInIntervalInSeconds: ${seconds}`),
      );

      expect(() => new YamlDefinitionUtility(definitionFilePath)).toThrow(
        expect.objectContaining({
          failures: expect.arrayContaining([`  [/settings/stateProvider/checkInIntervalInSeconds] ${failure}`]),
        }),
      );
    });

    it('should return nothing when the definition sets no interval', () => {
      const definition = new YamlDefinitionUtility(fixture('terraform-minimal-definition.yml'));

      expect(definition.resolveStateCheckInIntervalInMs()).toBeUndefined();
    });

    it('should return the interval in milliseconds', () => {
      const definition = new YamlDefinitionUtility(fixture('remote-state-definition.yml'));

      expect(definition.resolveStateCheckInIntervalInMs()).toBe(30 * 1000);
    });
  });

  describe('resolveTags()', () => {
    it('should return nothing when the definition declares no "tags" block', () => {
      const definition = new YamlDefinitionUtility(fixture('terraform-minimal-definition.yml'));

      expect(definition.resolveTags()).toEqual([]);
    });

    it('should parse every scope, and render an env-resolved value as a string', () => {
      const definition = new YamlDefinitionUtility(fixture('tags-definition.yml'));

      expect(definition.resolveTags()).toEqual([
        // An absent scope is the global scope, same as an empty one.
        { scope: {}, tags: { BudgetCode: '4815', ManagedBy: 'octo' } },
        { scope: {}, tags: { Owner: 'platform-team' } },
        { scope: { moduleId: 'app' }, tags: { Tier: 'network' } },
      ]);
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
          // Absent from the definition, so the alias falls back to the account id.
          accountName: undefined,
          providerType: 'aws',
          regionId: 'us-east-1',
          // Left undefined rather than defaulted here: octo decides per provider type, so that the
          // utility providers - which accept no arguments at all - do not get a `region` written
          // onto their block. An explicit value in the definition still wins, as below.
          setRegionAttribute: undefined,
          spec: { profile: 'default' }, // env-resolved from ${env.AWS_PROFILE}
        },
        {
          accountId: '222222222222',
          accountName: 'prod',
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
