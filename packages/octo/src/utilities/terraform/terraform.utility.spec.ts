import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { TerraformCommandError } from '../../errors/index.js';
import {
  type Event,
  TerraformProcessExitedEvent,
  TerraformProcessOutputEvent,
  TerraformProcessStartedEvent,
} from '../../events/index.js';
import { Container } from '../../functions/container/container.js';
import { EventService } from '../../services/event/event.service.js';
import {
  StateManagementService,
  type StateManagementServiceFactory,
} from '../../services/state-management/state-management.service.js';
import { TerraformStateService } from '../../services/state-management/terraform-state.service.js';
import { TestStateProvider } from '../../services/state-management/test.state-provider.js';
import { TerraformUtility } from './terraform.utility.js';

type OnChunk = Parameters<TerraformUtility['spawnAsync']>[3];

type SpawnOptions = Parameters<TerraformUtility['spawnAsync']>[2];

class TestableTerraformUtility extends TerraformUtility {
  readonly spawnAsyncMock = jest
    .fn<
      (
        file: string,
        args: string[],
        options: SpawnOptions,
        onChunk: OnChunk,
      ) => ReturnType<TerraformUtility['spawnAsync']>
    >()
    .mockResolvedValue({ stderr: '', stdout: '' });

  protected override spawnAsync(
    file: string,
    args: string[],
    options: SpawnOptions,
    onChunk: OnChunk,
  ): ReturnType<TerraformUtility['spawnAsync']> {
    return this.spawnAsyncMock(file, args, options, onChunk);
  }
}

/**
 * Runs the real {@link TerraformUtility.spawnAsync}, so the streaming below is exercised against an
 * actual child process rather than a stub of one.
 */
class StreamingTerraformUtility extends TerraformUtility {
  runReal(script: string, keepStdout: boolean, onChunk: OnChunk): ReturnType<TerraformUtility['spawnAsync']> {
    return this.spawnAsync(process.execPath, ['-e', script], { env: process.env, keepStdout }, onChunk);
  }
}

describe('TerraformUtility UT', () => {
  let stateProvider: TestStateProvider;
  let terragruntDir: string;
  let terraform: TestableTerraformUtility;

  beforeEach(async () => {
    terragruntDir = await mkdtemp(join(tmpdir(), 'terraform-utility-'));
    terraform = new TestableTerraformUtility({});

    // Every command checks terraform state out of the state provider and back into it, so one has
    // to be there before any of them runs.
    stateProvider = new TestStateProvider();
    await Container.getInstance().get<StateManagementService, typeof StateManagementServiceFactory>(
      StateManagementService,
      { args: [stateProvider] },
    );
  });

  afterEach(async () => {
    await rm(terragruntDir, { force: true, recursive: true });
  });

  function argvOf(callIndex: number): string[] {
    return terraform.spawnAsyncMock.mock.calls[callIndex][1];
  }

  async function createModuleFolder(name: string): Promise<void> {
    const moduleDir = join(terragruntDir, name);
    await mkdir(moduleDir);
    await writeFile(join(moduleDir, 'terragrunt.hcl'), '');
  }

  describe('apply() output', () => {
    it('should keep the stdout of a process asked for JSON only', async () => {
      await terraform.apply(terragruntDir);

      expect(terraform.spawnAsyncMock.mock.calls[0][2].keepStdout).toBe(false);
    });
  });

  describe('spawnAsync()', () => {
    const streaming = new StreamingTerraformUtility({});

    it('should reject with the exit code of a process that fails', async () => {
      await expect(
        streaming.runReal('process.stderr.write("Error: bad"); process.exit(3);', false, () => undefined),
      ).rejects.toMatchObject({ code: 3, stderr: 'Error: bad' });
    });

    it('should stream each chunk and hold no stdout unless asked to', async () => {
      const chunks: [string, string][] = [];

      const result = await streaming.runReal(
        'process.stdout.write("out-chunk"); process.stderr.write("err-chunk");',
        false,
        (chunk, stream) => chunks.push([stream, chunk]),
      );

      expect(chunks).toEqual([
        ['stdout', 'out-chunk'],
        ['stderr', 'err-chunk'],
      ]);
      expect(result).toEqual({ stderr: 'err-chunk', stdout: '' });
    });

    it('should keep the whole stdout when asked to', async () => {
      const result = await streaming.runReal('process.stdout.write("{}");', true, () => undefined);

      expect(result.stdout).toBe('{}');
    });

    it('should keep only the last 64 KB of stderr', async () => {
      const result = await streaming.runReal(
        'process.stderr.write("a".repeat(70 * 1024) + "end");',
        false,
        () => undefined,
      );

      expect(result.stderr).toHaveLength(64 * 1024);
      expect(result.stderr.endsWith('end')).toBe(true);
    });
  });

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

      const showCall = terraform.spawnAsyncMock.mock.calls.find((call) => call[1][0] === 'show');
      expect(showCall![1]).not.toEqual(expect.arrayContaining(['-lock=false']));
    });

    it('shares setArgsOnce() across every per-folder invocation within one call, then clears it', async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      terraform.setArgsOnce(['-lock=false']);

      await terraform.plan(terragruntDir, { json: true });
      const planCallsWithOnceArg = terraform.spawnAsyncMock.mock.calls.filter(
        (call) => call[1][0] === 'plan' && call[1].includes('-lock=false'),
      );
      expect(planCallsWithOnceArg).toHaveLength(2);

      terraform.spawnAsyncMock.mockClear();
      await terraform.plan(terragruntDir, { json: true });
      const planCallsAfter = terraform.spawnAsyncMock.mock.calls.filter((call) => call[1][0] === 'plan');
      for (const call of planCallsAfter) {
        expect(call[1]).not.toEqual(expect.arrayContaining(['-lock=false']));
      }
    });
  });

  describe('validate()/apply()/destroy()', () => {
    it('composes "run --all -- validate" in the real path of the directory', async () => {
      await terraform.validate(terragruntDir);

      expect(argvOf(0)).toEqual([
        '--non-interactive',
        '--no-color',
        '--working-dir',
        await realpath(terragruntDir),
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

  describe('listModuleFolders()', () => {
    it('returns only immediate sub-directories containing terragrunt.hcl, sorted', async () => {
      await createModuleFolder('module-b');
      await createModuleFolder('module-a');
      await mkdir(join(terragruntDir, 'not-a-module'));

      const moduleIds = await terraform.listModuleFolders(terragruntDir);

      expect(moduleIds).toEqual(['module-a', 'module-b']);
    });

    it('returns an empty array when there are no module folders', async () => {
      const moduleIds = await terraform.listModuleFolders(terragruntDir);

      expect(moduleIds).toEqual([]);
    });
  });

  describe('plan()/output() - non-json', () => {
    it('plan() runs a single "run --all -- plan" shell-out with no folder enumeration', async () => {
      const result = await terraform.plan(terragruntDir);

      expect(terraform.spawnAsyncMock).toHaveBeenCalledTimes(1);
      expect(argvOf(0).slice(-2)).toEqual(['plan', '-input=false']);
      expect(result).toEqual({ args: argvOf(0), exitCode: 0 });
    });

    it('output() runs a single "run --all -- output" shell-out with no folder enumeration', async () => {
      await terraform.output(terragruntDir);

      expect(terraform.spawnAsyncMock).toHaveBeenCalledTimes(1);
      expect(argvOf(0).slice(-1)).toEqual(['output']);
    });
  });

  describe('process output', () => {
    let events: (TerraformProcessExitedEvent | TerraformProcessOutputEvent | TerraformProcessStartedEvent)[];

    beforeEach(() => {
      events = [];
      jest.spyOn(EventService.getInstance(), 'emit').mockImplementation((event: Event<unknown>) => {
        if (
          event instanceof TerraformProcessExitedEvent ||
          event instanceof TerraformProcessOutputEvent ||
          event instanceof TerraformProcessStartedEvent
        ) {
          events.push(event);
        }
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should emit the start of a failed process, what it wrote, then its exit', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async (_file, _args, _options, onChunk) => {
        onChunk('planning', 'stdout');
        onChunk('Error: bad', 'stderr');
        throw Object.assign(new Error('failed'), { code: 1, stderr: 'Error: bad', stdout: '' });
      });

      await terraform.plan(terragruntDir, { json: true });

      const dir = join(await realpath(terragruntDir), 'module-a');
      const [{ processId }] = events.map((event) => event.payload);
      expect(events.map((event) => [event.constructor.name, event.name, event.payload])).toEqual([
        [
          'TerraformProcessStartedEvent',
          'plan',
          { args: expect.arrayContaining(['plan']), binary: 'terragrunt', dir, processId },
        ],
        ['TerraformProcessOutputEvent', 'plan', { processId, stream: 'stdout', text: 'planning' }],
        ['TerraformProcessOutputEvent', 'plan', { processId, stream: 'stderr', text: 'Error: bad' }],
        ['TerraformProcessExitedEvent', 'plan', { exitCode: 1, processId }],
      ]);
    });

    it('should give each process an id of its own', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => ({
        stderr: '',
        stdout: args[0] === 'show' ? JSON.stringify({ resource_changes: [] }) : '',
      }));

      await terraform.plan(terragruntDir, { json: true });

      const processIds = events
        .filter((event) => event instanceof TerraformProcessStartedEvent)
        .map((event) => event.payload.processId);
      expect(processIds).toHaveLength(2);
      expect(new Set(processIds).size).toBe(2);
    });

    it('should emit the start and exit of a run over every folder, named after its command', async () => {
      await terraform.apply(terragruntDir);

      const processId = expect.any(Number);
      expect(events.map((event) => [event.name, event.payload])).toEqual([
        [
          'apply',
          {
            args: expect.arrayContaining(['apply']),
            binary: 'terragrunt',
            dir: await realpath(terragruntDir),
            processId,
          },
        ],
        ['apply', { exitCode: 0, processId }],
      ]);
    });

    it('should emit exit code -1 for a process that could not start', async () => {
      terraform.spawnAsyncMock.mockRejectedValue(
        Object.assign(new Error('spawn terragrunt ENOENT'), { code: 'ENOENT' }),
      );

      await expect(terraform.apply(terragruntDir)).rejects.toBeInstanceOf(TerraformCommandError);

      expect(
        events.filter((event) => event instanceof TerraformProcessExitedEvent).map((event) => event.payload),
      ).toEqual([{ exitCode: -1, processId: expect.any(Number) }]);
    });
  });

  describe('plan(dir, { json: true })', () => {
    it('enumerates only folders containing terragrunt.hcl and returns a Map keyed by folder name', async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      await mkdir(join(terragruntDir, 'not-a-module'));

      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect([...plans.keys()].sort()).toEqual(['module-a', 'module-b']);
      expect(plans.get('module-a')).toEqual({ resource_changes: [] });
      expect(errors.size).toBe(0);
    });

    it('runs the two-step plan-then-show-json per folder', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      await terraform.plan(terragruntDir, { json: true });

      expect(terraform.spawnAsyncMock.mock.calls.map((call) => call[1][0])).toEqual(['plan', 'show']);
      const planArgs = argvOf(0);
      expect(planArgs[0]).toBe('plan');
      expect(planArgs.some((a) => a.startsWith('-out='))).toBe(true);
    });

    it('resolves an empty Map without spawning a process when there are no module folders', async () => {
      const { plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(terraform.spawnAsyncMock).not.toHaveBeenCalled();
    });

    it('omits a folder whose show -json output is not valid JSON, but keeps the rest', async () => {
      await createModuleFolder('module-bad');
      await createModuleFolder('module-good');

      terraform.spawnAsyncMock.mockImplementation(async (_file, args, options) => {
        if (args[0] === 'show') {
          if ((options.cwd as string)?.endsWith('module-bad')) {
            return { stderr: '', stdout: 'not json' };
          }
          return { stderr: '', stdout: JSON.stringify({ resource_changes: [] }) };
        }
        return { stderr: '', stdout: '' };
      });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect([...plans.keys()]).toEqual(['module-good']);
      expect([...errors.keys()]).toEqual(['module-bad']);
    });

    it('cleans up its per-folder temp directory even when show -json throws', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          throw Object.assign(new Error('boom'), { stderr: 'boom', stdout: '' });
        }
        return { stderr: '', stdout: '' };
      });

      const { plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
    });

    it("carries terraform's own error for a folder that failed to plan", async () => {
      await createModuleFolder('region-module');
      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'plan') {
          throw Object.assign(new Error('exit 1'), {
            stderr: 'Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set\n',
            stdout: '',
          });
        }
        return { stderr: '', stdout: '' };
      });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(errors.get('region-module')).toBe('Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set');
    });

    it('falls back to the wrapped error message when the failure carried no stderr', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
        if (args[0] === 'show') {
          return { stderr: '', stdout: 'not json' };
        }
        return { stderr: '', stdout: '' };
      });

      const { errors } = await terraform.plan(terragruntDir, { json: true });

      expect(errors.get('module-a')).toContain('JSON');
    });
  });

  describe('output(dir, { json: true })', () => {
    it('reads per-folder "output -json" into a Map keyed by folder name', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockResolvedValue({
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

      terraform.spawnAsyncMock.mockImplementation(async (_file, _args, options) => {
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

      expect(terraform.spawnAsyncMock.mock.calls[0][0]).toBe('/opt/bin/terragrunt');
    });

    it('passes terraformBinary through as TG_TF_PATH in the child-process env', async () => {
      terraform = new TestableTerraformUtility({ terraformBinary: '/opt/bin/terraform' });
      await terraform.validate(terragruntDir);

      expect(terraform.spawnAsyncMock.mock.calls[0][2].env?.TG_TF_PATH).toBe('/opt/bin/terraform');
    });

    it('does not set TG_TF_PATH when terraformBinary is not configured', async () => {
      await terraform.validate(terragruntDir);

      expect(terraform.spawnAsyncMock.mock.calls[0][2].env?.TG_TF_PATH).toBeUndefined();
    });

    it('passes timeoutInMs as the timeout option, defaulting to 60 minutes', async () => {
      await terraform.validate(terragruntDir);
      expect(terraform.spawnAsyncMock.mock.calls[0][2].timeout).toBe(60 * 60 * 1000);

      const withCustom = new TestableTerraformUtility({ timeoutInMs: 1000 });
      await withCustom.validate(terragruntDir);
      expect(withCustom.spawnAsyncMock.mock.calls[0][2].timeout).toBe(1000);
    });

    // Killing a command part way through a mutation is worse than letting a slow one finish, and no
    // default knows how long a given stack takes.
    it.each(['apply', 'destroy'] as const)('leaves %s unbounded when no timeout was asked for', async (command) => {
      await terraform[command](terragruntDir);

      expect(terraform.spawnAsyncMock.mock.calls[0][2].timeout).toBeUndefined();
    });

    it.each(['apply', 'destroy'] as const)('bounds %s by the timeout the caller asked for', async (command) => {
      const withCustom = new TestableTerraformUtility({ timeoutInMs: 1000 });

      await withCustom[command](terragruntDir);

      expect(withCustom.spawnAsyncMock.mock.calls[0][2].timeout).toBe(1000);
    });

    it('checks terraform state in every stateCheckInIntervalInMs, defaulting to 10 seconds', async () => {
      const startPeriodicCheckIn = jest.spyOn(TerraformStateService.prototype, 'startPeriodicCheckIn');

      await terraform.apply(terragruntDir);
      await new TestableTerraformUtility({ stateCheckInIntervalInMs: 30 * 1000 }).apply(terragruntDir);

      expect(startPeriodicCheckIn.mock.calls.map((call) => call[2])).toEqual([10 * 1000, 30 * 1000]);
      startPeriodicCheckIn.mockRestore();
    });
  });

  describe('errors', () => {
    it('throws a TerraformCommandError with stdout/stderr/exitCode/args on a nonzero exit', async () => {
      terraform.spawnAsyncMock.mockRejectedValue(
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
      terraform.spawnAsyncMock.mockRejectedValue(
        Object.assign(new Error('spawn terragrunt ENOENT'), { code: 'ENOENT' }),
      );

      await expect(terraform.validate(terragruntDir)).rejects.toThrow(/terragrunt/);
    });
  });

  // Terraform state lives with octo state, not in the module folder, so every command has to put it
  // there and take it back.
  describe('terraform state', () => {
    it('should write the state provider state into each module folder before running', async () => {
      await createModuleFolder('module-a');
      await stateProvider.saveStates([{ data: Buffer.from('{"resources":[{}]}'), stateFileName: 'module-a.tfstate' }]);

      await terraform.apply(terragruntDir);

      expect((await readFile(join(terragruntDir, 'module-a', 'terraform.tfstate'))).toString()).toBe(
        '{"resources":[{}]}',
      );
    });

    it('should write each module folder state back to the state provider after running', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async () => {
        await writeFile(join(terragruntDir, 'module-a', 'terraform.tfstate'), '{"resources":[{"applied":true}]}');
        return { stderr: '', stdout: '' };
      });

      await terraform.apply(terragruntDir);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe('{"resources":[{"applied":true}]}');
    });

    it('should write the state back even when the command fails', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockImplementation(async () => {
        await writeFile(join(terragruntDir, 'module-a', 'terraform.tfstate'), '{"resources":[{"halfBuilt":true}]}');
        throw Object.assign(new Error('exit 1'), { code: 1, stderr: 'boom', stdout: '' });
      });

      await expect(terraform.apply(terragruntDir)).rejects.toBeInstanceOf(TerraformCommandError);

      expect((await stateProvider.getState('module-a.tfstate')).toString()).toBe('{"resources":[{"halfBuilt":true}]}');
    });

    it('should keep the command error when the state cannot be written back either', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockRejectedValue(
        Object.assign(new Error('exit 1'), { code: 1, stderr: 'boom', stdout: '' }),
      );
      jest.spyOn(stateProvider, 'saveStates').mockRejectedValue(new Error('Failed to write the app state: refused!'));
      const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        await expect(terraform.apply(terragruntDir)).rejects.toMatchObject({ stderr: 'boom' });
        expect(stderrWrite).toHaveBeenCalledWith(
          'Failed to check terraform state in: Failed to write the app state: refused!\n',
        );
      } finally {
        stderrWrite.mockRestore();
      }
    });

    it('should throw the error of writing the state back when the command succeeds', async () => {
      await createModuleFolder('module-a');
      jest.spyOn(stateProvider, 'saveStates').mockRejectedValue(new Error('Failed to write the app state: refused!'));

      await expect(terraform.apply(terragruntDir)).rejects.toThrow('Failed to write the app state: refused!');
    });
  });

  describe('findPlannedDestroys()', () => {
    it('collects every destroy, counting a recreate, and ignores data sources and no-ops', () => {
      const destroys = terraform.findPlannedDestroys(
        new Map([
          [
            'region-module',
            {
              resource_changes: [
                { address: 'aws_vpc.vpc-1', change: { actions: ['no-op'] } },
                { address: 'aws_efs_file_system.efs-1', change: { actions: ['create', 'delete'] } },
                { address: 'data.aws_image.stale', change: { actions: ['delete'] }, mode: 'data' },
              ],
            },
          ],
          [
            'sg-module',
            { resource_changes: [{ address: 'aws_security_group.sg-1', change: { actions: ['delete'] } }] },
          ],
        ]),
      );

      expect(destroys).toEqual([
        { address: 'aws_efs_file_system.efs-1', moduleId: 'region-module', tfActions: ['create', 'delete'] },
        { address: 'aws_security_group.sg-1', moduleId: 'sg-module', tfActions: ['delete'] },
      ]);
    });

    it('finds nothing in a plan that only creates and updates', () => {
      const destroys = terraform.findPlannedDestroys(
        new Map([
          [
            'region-module',
            {
              resource_changes: [
                { address: 'aws_vpc.vpc-1', change: { actions: ['create'] } },
                { address: 'aws_subnet.subnet-1', change: { actions: ['update'] } },
              ],
            },
          ],
        ]),
      );

      expect(destroys).toEqual([]);
    });
  });

  describe('TerraformUtilityFactory', () => {
    it('wires configuration through to the constructed instance', async () => {
      const { TerraformUtilityFactory } = await import('./terraform.utility.js');
      const instance = await TerraformUtilityFactory.create({ terragruntBinary: '/opt/bin/terragrunt' }, true);
      const options = instance['options'] as { terragruntBinary?: string };

      expect(options.terragruntBinary).toBe('/opt/bin/terragrunt');
    });
  });
});
