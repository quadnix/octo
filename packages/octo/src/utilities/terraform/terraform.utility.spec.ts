import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { TerraformCommandError } from '../../errors/index.js';
import { TerraformUtility } from './terraform.utility.js';

class TestableTerraformUtility extends TerraformUtility {
  readonly execFileAsyncMock = jest
    .fn<
      (
        file: string,
        args: string[],
        options: ExecFileOptionsWithStringEncoding,
      ) => ReturnType<TerraformUtility['execFileAsync']>
    >()
    .mockResolvedValue({ stderr: '', stdout: '' });

  protected override execFileAsync(
    file: string,
    args: string[],
    options: ExecFileOptionsWithStringEncoding,
  ): ReturnType<TerraformUtility['execFileAsync']> {
    return this.execFileAsyncMock(file, args, options);
  }
}

describe('TerraformUtility UT', () => {
  let terragruntDir: string;
  let terraform: TestableTerraformUtility;

  beforeEach(async () => {
    terragruntDir = await mkdtemp(join(tmpdir(), 'terraform-utility-'));
    terraform = new TestableTerraformUtility({});
  });

  afterEach(async () => {
    await rm(terragruntDir, { force: true, recursive: true });
  });

  function argvOf(callIndex: number): string[] {
    return terraform.execFileAsyncMock.mock.calls[callIndex][1];
  }

  async function createModuleFolder(name: string): Promise<void> {
    const moduleDir = join(terragruntDir, name);
    await mkdir(moduleDir);
    await writeFile(join(moduleDir, 'terragrunt.hcl'), '');
  }

  describe('setArgsOnce()', () => {
    it('applies setArgsOnce() to only the immediately next command', async () => {
      terraform.setArgsOnce(['-lock=false']);

      await terraform.validate(terragruntDir);
      await terraform.apply(terragruntDir);

      expect(argvOf(0)).toEqual(expect.arrayContaining(['-lock=false']));
      expect(argvOf(1)).not.toEqual(expect.arrayContaining(['-lock=false']));
    });

    it('does not apply setArgsOnce() to the internal "show -json" step of a JSON plan', async () => {
      await createModuleFolder('module-a');
      terraform.setArgsOnce(['-lock=false']);

      await terraform.plan(terragruntDir, { json: true });

      const showCall = terraform.execFileAsyncMock.mock.calls.find((call) => call[1][0] === 'show');
      expect(showCall![1]).not.toEqual(expect.arrayContaining(['-lock=false']));
    });

    it('shares setArgsOnce() across every per-folder invocation within one call, then clears it', async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      terraform.setArgsOnce(['-lock=false']);

      await terraform.plan(terragruntDir, { json: true });
      const planCallsWithOnceArg = terraform.execFileAsyncMock.mock.calls.filter(
        (call) => call[1][0] === 'plan' && call[1].includes('-lock=false'),
      );
      expect(planCallsWithOnceArg).toHaveLength(2);

      terraform.execFileAsyncMock.mockClear();
      await terraform.plan(terragruntDir, { json: true });
      const planCallsAfter = terraform.execFileAsyncMock.mock.calls.filter((call) => call[1][0] === 'plan');
      for (const call of planCallsAfter) {
        expect(call[1]).not.toEqual(expect.arrayContaining(['-lock=false']));
      }
    });
  });

  describe('validate()/apply()/destroy()', () => {
    it('composes "run --all -- validate"', async () => {
      await terraform.validate(terragruntDir);

      expect(argvOf(0)).toEqual([
        '--non-interactive',
        '--no-color',
        '--working-dir',
        terragruntDir,
        'run',
        '--all',
        '--',
        'validate',
      ]);
    });

    it('composes "run --all -- apply -input=false -auto-approve"', async () => {
      await terraform.apply(terragruntDir);

      expect(argvOf(0).slice(-3)).toEqual(['apply', '-input=false', '-auto-approve']);
    });

    it('composes "run --all -- destroy -input=false -auto-approve"', async () => {
      await terraform.destroy(terragruntDir);

      expect(argvOf(0).slice(-3)).toEqual(['destroy', '-input=false', '-auto-approve']);
    });
  });

  describe('plan()/output() - non-json', () => {
    it('plan() runs a single "run --all -- plan" shell-out with no folder enumeration', async () => {
      const result = await terraform.plan(terragruntDir);

      expect(terraform.execFileAsyncMock).toHaveBeenCalledTimes(1);
      expect(argvOf(0).slice(-2)).toEqual(['plan', '-input=false']);
      expect(result).toEqual({ args: argvOf(0), exitCode: 0, stderr: '', stdout: '' });
    });

    it('output() runs a single "run --all -- output" shell-out with no folder enumeration', async () => {
      await terraform.output(terragruntDir);

      expect(terraform.execFileAsyncMock).toHaveBeenCalledTimes(1);
      expect(argvOf(0).slice(-1)).toEqual(['output']);
    });
  });

  describe('plan(dir, { json: true })', () => {
    it('enumerates only folders containing terragrunt.hcl and returns a Map keyed by folder name', async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      await mkdir(join(terragruntDir, 'not-a-module'));

      terraform.execFileAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      const plans = await terraform.plan(terragruntDir, { json: true });

      expect([...plans.keys()].sort()).toEqual(['module-a', 'module-b']);
      expect(plans.get('module-a')).toEqual({ resource_changes: [] });
    });

    it('runs the two-step plan-then-show-json per folder', async () => {
      await createModuleFolder('module-a');
      terraform.execFileAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      await terraform.plan(terragruntDir, { json: true });

      expect(terraform.execFileAsyncMock.mock.calls.map((call) => call[1][0])).toEqual(['plan', 'show']);
      const planArgs = argvOf(0);
      expect(planArgs[0]).toBe('plan');
      expect(planArgs.some((a) => a.startsWith('-out='))).toBe(true);
    });

    it('resolves an empty Map without invoking execFileAsync when there are no module folders', async () => {
      const plans = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(terraform.execFileAsyncMock).not.toHaveBeenCalled();
    });

    it('omits a folder whose show -json output is not valid JSON, but keeps the rest', async () => {
      await createModuleFolder('module-bad');
      await createModuleFolder('module-good');

      terraform.execFileAsyncMock.mockImplementation(async (_file, args, options) => {
        if (args[0] === 'show') {
          if ((options.cwd as string)?.endsWith('module-bad')) {
            return { stderr: '', stdout: 'not json' };
          }
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      const plans = await terraform.plan(terragruntDir, { json: true });

      expect([...plans.keys()]).toEqual(['module-good']);
    });

    it('cleans up its per-folder temp directory even when show -json throws', async () => {
      await createModuleFolder('module-a');
      terraform.execFileAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          throw Object.assign(new Error('boom'), { stderr: 'boom', stdout: '' });
        }
        return { stderr: '', stdout: '' };
      });

      const plans = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
    });
  });

  describe('output(dir, { json: true })', () => {
    it('reads per-folder "output -json" into a Map keyed by folder name', async () => {
      await createModuleFolder('module-a');
      terraform.execFileAsyncMock.mockResolvedValue({
        stderr: '',
        stdout: JSON.stringify({ bucket: { value: 'my-bucket' } }),
      });

      const outputs = await terraform.output(terragruntDir, { json: true });

      expect(outputs.get('module-a')).toEqual({ bucket: { value: 'my-bucket' } });
      expect(argvOf(0).slice(0, 2)).toEqual(['output', '-json']);
    });

    it('omits a folder whose output read fails, but keeps the rest', async () => {
      await createModuleFolder('module-bad');
      await createModuleFolder('module-good');

      terraform.execFileAsyncMock.mockImplementation(async (_file, _args, options) => {
        if ((options.cwd as string)?.endsWith('module-bad')) {
          throw Object.assign(new Error('boom'), { stderr: 'boom', stdout: '' });
        }
        return { stderr: '', stdout: JSON.stringify({}) };
      });

      const outputs = await terraform.output(terragruntDir, { json: true });

      expect([...outputs.keys()]).toEqual(['module-good']);
    });
  });

  describe('configuration', () => {
    it('uses the configured terragruntBinary as the executable', async () => {
      terraform = new TestableTerraformUtility({ terragruntBinary: '/opt/bin/terragrunt' });
      await terraform.validate(terragruntDir);

      expect(terraform.execFileAsyncMock.mock.calls[0][0]).toBe('/opt/bin/terragrunt');
    });

    it('passes terraformBinary through as TG_TF_PATH in the child-process env', async () => {
      terraform = new TestableTerraformUtility({ terraformBinary: '/opt/bin/terraform' });
      await terraform.validate(terragruntDir);

      expect(terraform.execFileAsyncMock.mock.calls[0][2].env?.TG_TF_PATH).toBe('/opt/bin/terraform');
    });

    it('passes timeoutInMs as the timeout option, defaulting to 5 minutes', async () => {
      await terraform.validate(terragruntDir);
      expect(terraform.execFileAsyncMock.mock.calls[0][2].timeout).toBe(5 * 60 * 1000);

      const withCustom = new TestableTerraformUtility({ timeoutInMs: 1000 });
      await withCustom.validate(terragruntDir);
      expect(withCustom.execFileAsyncMock.mock.calls[0][2].timeout).toBe(1000);
    });
  });

  describe('errors', () => {
    it('throws a TerraformCommandError with stdout/stderr/exitCode/args on a nonzero exit', async () => {
      terraform.execFileAsyncMock.mockRejectedValue(
        Object.assign(new Error('exit 1'), { code: 1, stderr: 'invalid config', stdout: 'partial' }),
      );

      await expect(terraform.validate(terragruntDir)).rejects.toMatchObject({
        exitCode: 1,
        stderr: 'invalid config',
        stdout: 'partial',
      });
      await expect(terraform.validate(terragruntDir)).rejects.toBeInstanceOf(TerraformCommandError);
    });

    it('throws a clearly distinguishable error naming the binary on a spawn-level failure', async () => {
      terraform.execFileAsyncMock.mockRejectedValue(
        Object.assign(new Error('spawn terragrunt ENOENT'), { code: 'ENOENT' }),
      );

      await expect(terraform.validate(terragruntDir)).rejects.toThrow(/terragrunt/);
    });
  });

  describe('TerraformUtilityFactory', () => {
    it('wires configuration through to the constructed instance', async () => {
      const { TerraformUtilityFactory } = await import('./terraform.utility.js');
      const instance = await TerraformUtilityFactory.create([{ terragruntBinary: '/opt/bin/terragrunt' }], true);
      const options = instance['options'] as { terragruntBinary?: string };

      expect(options.terragruntBinary).toBe('/opt/bin/terragrunt');
    });
  });
});
