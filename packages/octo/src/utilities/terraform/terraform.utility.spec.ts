import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { TerraformCommandError, TerraformFormatError } from '../../errors/index.js';
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
    await mkdir(moduleDir, { recursive: true });
    await writeFile(join(moduleDir, 'terragrunt.hcl'), '');
  }

  /**
   * Has the next `run --all -- plan` write a JSON plan for each folder given one, and a run report
   * holding each folder's result, as terragrunt does.
   */
  function mockRunAllPlan(results: Record<string, { cause: string } | { plan: unknown }>): void {
    terraform.spawnAsyncMock.mockImplementation(async (_file, args) => {
      const planDir = args[args.indexOf('--json-out-dir') + 1];
      const reportFilePath = args[args.indexOf('--report-file') + 1];
      const units: { Cause?: string; Name: string; Result: string }[] = [];
      for (const [moduleId, result] of Object.entries(results)) {
        if ('plan' in result) {
          await mkdir(join(planDir, moduleId), { recursive: true });
          await writeFile(join(planDir, moduleId, 'tfplan.json'), JSON.stringify(result.plan));
          units.push({ Name: moduleId, Result: 'succeeded' });
        } else {
          units.push({ Cause: result.cause, Name: moduleId, Result: 'failed' });
        }
      }
      await writeFile(reportFilePath, JSON.stringify(units));
      if (units.some((unit) => unit.Result !== 'succeeded')) {
        throw Object.assign(new Error('exit 1'), { code: 1, stderr: 'run failed', stdout: '' });
      }
      return { stderr: '', stdout: '' };
    });
  }

  describe('apply() output', () => {
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

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
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

    it('applies setArgsOnce() to only the immediately next command', async () => {
      terraform.setArgsOnce(['-lock=false']);

      await terraform.validate(terragruntDir);
      await terraform.apply(terragruntDir);

      expect(argvOf(0)).toEqual(expect.arrayContaining(['-lock=false']));
      expect(argvOf(1)).not.toEqual(expect.arrayContaining(['-lock=false']));
    });

    it('passes setArgsOnce() to the plan of a JSON plan once, then clears it', async () => {
      await createModuleFolder('module-b');
      terraform.setArgsOnce(['-lock=false']);

      await terraform.plan(terragruntDir, { json: true });
      await terraform.plan(terragruntDir, { json: true });

      expect(argvOf(0).slice(argvOf(0).indexOf('--'))).toEqual(['--', 'plan', '-input=false', '-lock=false']);
      expect(argvOf(1)).not.toEqual(expect.arrayContaining(['-lock=false']));
    });
  });

  describe('validate()/apply()/destroy()', () => {
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

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

    it.each(['apply', 'destroy', 'validate'] as const)(
      'should run nothing for %s when the directory holds no module folders',
      async (command) => {
        await rm(terragruntDir, { force: true, recursive: true });

        await expect(terraform[command](terragruntDir)).resolves.toMatchObject({ exitCode: 0 });

        expect(terraform.spawnAsyncMock).not.toHaveBeenCalled();
      },
    );

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
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

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

    beforeEach(async () => {
      await createModuleFolder('module-a');
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

      const dir = await realpath(terragruntDir);
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
      await terraform.apply(terragruntDir);
      await terraform.apply(terragruntDir);

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
    it('should report a folder whose plan is in a format version octo does not read', async () => {
      await createModuleFolder('module-a');
      mockRunAllPlan({ 'module-a': { plan: { format_version: '2.0', resource_changes: [] } } });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(errors.get('module-a')).toBe('Terraform plan format version "2.0" is not one octo reads (1.x)!');
    });

    it('should carry the cause the run report gives for a folder that failed to plan', async () => {
      await createModuleFolder('module-bad');
      await createModuleFolder('module-good');
      mockRunAllPlan({
        'module-bad': { cause: 'Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set\n' },
        'module-good': { plan: { format_version: '1.2', resource_changes: [] } },
      });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect([...plans.keys()]).toEqual(['module-good']);
      expect(errors.get('module-bad')).toBe('Error: "10.0.1.0/16" is not a valid CIDR block: has host bits set');
    });

    it('should give the run failure to a folder the run wrote nothing for', async () => {
      await createModuleFolder('module-a');
      terraform.spawnAsyncMock.mockRejectedValue(
        Object.assign(new Error('exit 1'), { code: 1, stderr: 'Error: Unreadable terragrunt.hcl\n', stdout: '' }),
      );

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(errors.get('module-a')).toBe('Error: Unreadable terragrunt.hcl');
    });

    it('should report a folder the run says succeeded but wrote no plan for', async () => {
      await createModuleFolder('module-a');
      mockRunAllPlan({});

      const { errors } = await terraform.plan(terragruntDir, { json: true });

      expect(errors.get('module-a')).toBe('Terraform wrote no plan!');
    });

    it('should resolve an empty Map without spawning a process when there are no module folders', async () => {
      const { plans } = await terraform.plan(terragruntDir, { json: true });

      expect(plans.size).toBe(0);
      expect(terraform.spawnAsyncMock).not.toHaveBeenCalled();
    });

    it('should plan every folder holding terragrunt.hcl in one run, keyed by folder name', async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      await mkdir(join(terragruntDir, 'not-a-module'));
      mockRunAllPlan({
        'module-a': { plan: { format_version: '1.2', resource_changes: [] } },
        'module-b': { plan: { format_version: '1.2', resource_changes: [] } },
      });

      const { errors, plans } = await terraform.plan(terragruntDir, { json: true });

      expect(terraform.spawnAsyncMock).toHaveBeenCalledTimes(1);
      expect(argvOf(0)).toEqual(
        expect.arrayContaining(['run', '--all', '--queue-ignore-errors', '--json-out-dir', '--report-file']),
      );
      expect([...plans.keys()].sort()).toEqual(['module-a', 'module-b']);
      expect(plans.get('module-a')).toEqual({ format_version: '1.2', resource_changes: [] });
      expect(errors.size).toBe(0);
    });
  });

  describe('output(dir, { json: true })', () => {
    it('should throw error when an output does not hold its value', async () => {
      await createModuleFolder('module-a');
      await stateProvider.saveStates([
        { data: Buffer.from(JSON.stringify({ outputs: { bucket: 'my-bucket' } })), stateFileName: 'module-a.tfstate' },
      ]);

      await expect(terraform.output(terragruntDir, { json: true })).rejects.toBeInstanceOf(TerraformFormatError);
    });

    it("should read each folder's outputs from its terraform state without running terraform", async () => {
      await createModuleFolder('module-a');
      await createModuleFolder('module-b');
      await stateProvider.saveStates([
        {
          data: Buffer.from(JSON.stringify({ outputs: { bucket: { type: 'string', value: 'my-bucket' } } })),
          stateFileName: 'module-a.tfstate',
        },
      ]);

      const outputs = await terraform.output(terragruntDir, { json: true });

      expect(outputs.get('module-a')).toEqual({ bucket: { type: 'string', value: 'my-bucket' } });
      expect(outputs.get('module-b')).toEqual({});
      expect(terraform.spawnAsyncMock).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

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
    beforeEach(async () => {
      await createModuleFolder('module-a');
    });

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

  describe('deleteDestroyedFolders()', () => {
    it('should keep a folder whose terraform state still holds resources', async () => {
      await createModuleFolder('module-a');
      await stateProvider.saveStates([{ data: Buffer.from('{"resources":[{}]}'), stateFileName: 'module-a.tfstate' }]);

      const deletedModuleIds = await terraform.deleteDestroyedFolders(terragruntDir, ['module-a']);

      expect(deletedModuleIds).toEqual([]);
      expect(await terraform.listModuleFolders(terragruntDir)).toEqual(['module-a']);
    });

    it('should keep a folder it was not named', async () => {
      await createModuleFolder('module-a');

      const deletedModuleIds = await terraform.deleteDestroyedFolders(terragruntDir, []);

      expect(deletedModuleIds).toEqual([]);
      expect(await terraform.listModuleFolders(terragruntDir)).toEqual(['module-a']);
    });

    it('should delete a named folder whose terraform state holds no resources, or that has none', async () => {
      await createModuleFolder('module-destroyed');
      await createModuleFolder('module-never-applied');
      await writeFile(join(terragruntDir, 'module-destroyed', 'terraform.tfstate'), '{"resources":[]}');

      const deletedModuleIds = await terraform.deleteDestroyedFolders(terragruntDir, [
        'module-destroyed',
        'module-never-applied',
      ]);

      expect(deletedModuleIds).toEqual(['module-destroyed', 'module-never-applied']);
      expect(await terraform.listModuleFolders(terragruntDir)).toEqual([]);
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

    it('should count an action octo does not know as a destroy', () => {
      const destroys = terraform.findPlannedDestroys(
        new Map([
          [
            'region-module',
            {
              resource_changes: [
                { address: 'aws_s3_bucket.this', change: { actions: ['archive'] } },
                { address: 'aws_s3_bucket.kept', change: { actions: ['forget'] } },
              ],
            },
          ],
        ]),
      );

      expect(destroys).toEqual([{ address: 'aws_s3_bucket.this', moduleId: 'region-module', tfActions: ['archive'] }]);
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

  describe('findMissingExternalResources()', () => {
    const placeholder = (actions: string[]): { address: string; change: { actions: string[] } } => ({
      address: 'null_resource.tag-1',
      change: { actions },
    });

    it('should name an external resource whose check failed while its placeholder is unchanged', () => {
      const missing = TerraformUtility.findMissingExternalResources(
        new Map([
          [
            'tag-module',
            {
              checks: [
                {
                  address: { kind: 'check', name: 'tag-1' },
                  instances: [{ problems: [{ message: 'Image is gone!' }] }],
                  status: 'fail',
                },
              ],
              resource_changes: [placeholder(['no-op'])],
            },
          ],
        ]),
      );

      expect(missing).toEqual([{ address: 'null_resource.tag-1', message: 'Image is gone!', moduleId: 'tag-module' }]);
    });

    it('should name nothing for a check that passed, or a placeholder about to be created', () => {
      const failedCheck = { address: { kind: 'check', name: 'tag-1' }, status: 'fail' };
      const missing = TerraformUtility.findMissingExternalResources(
        new Map([
          [
            'passed-module',
            {
              checks: [{ ...failedCheck, status: 'pass' }],
              resource_changes: [placeholder(['no-op'])],
            },
          ],
          ['created-module', { checks: [failedCheck], resource_changes: [placeholder(['create'])] }],
          ['no-placeholder-module', { checks: [failedCheck], resource_changes: [] }],
        ]),
      );

      expect(missing).toEqual([]);
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
