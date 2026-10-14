import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import { type Dirent, existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Factory } from '../../decorators/factory.decorator.js';
import { TerraformCommandError } from '../../errors/index.js';
import {
  TerraformCommandFinishedEvent,
  TerraformCommandOutputEvent,
  TerraformCommandStartedEvent,
} from '../../events/index.js';
import { Container } from '../../functions/container/container.js';
import type { TerraformOutputs } from '../../modes/commit.mode.js';
import type { TerraformPlan } from '../../modes/validate.mode.js';
import { EventService } from '../../services/event/event.service.js';
import { TerraformStateService } from '../../services/state-management/terraform-state.service.js';
import { PROJECT_ROOT_VARIABLE_NAME } from '../../services/terraform/terraform.type.js';

const DEFAULT_STATE_CHECK_IN_INTERVAL_IN_MS = 10 * 1000;
const DEFAULT_TIMEOUT_IN_MS = 60 * 60 * 1000; // 60 minutes.
const TERRAFORM_STATE_FILE_NAME = 'terraform.tfstate';

/**
 * The commands that change infrastructure, and so are left unbounded unless the caller asks for a
 * bound. Everything else only reads, where a timeout costs nothing and catches a hang.
 */
const MUTATING_COMMANDS = new Set(['apply', 'destroy']);
const MAX_BUFFER = 256 * 1024 * 1024; // 256 KB.

interface TerraformRawResult {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * The result of planning every module folder under a terragrunt directory.
 *
 * A folder appears in exactly one of the two maps: in `plans` when terraform produced a plan, or in
 * `errors` with the reason it could not. Both are keyed by the folder name, i.e. the octo `moduleId`.
 * `errors` is what lets `validate` say why a folder could not be inspected.
 */
interface TerraformPlanResult {
  errors: Map<string, string>;
  plans: Map<string, TerraformPlan>;
}

/**
 * Octo's single interface to the terraform and terragrunt binaries.
 *
 * {@link Octo.generate} writes module folders; this runs them, and turns their output back into the
 * shapes the other modes expect - `plan(dir, { json: true })` feeds {@link Octo.validate}, and
 * `output(dir, { json: true })` feeds {@link Octo.commit}. Routing every invocation through one class
 * is what keeps flags, timeouts, and event emission consistent.
 *
 * Resolve it from the {@link Container} so that a run's terraform events reach the same listeners as
 * everything else.
 *
 * @example
 * ```ts
 * const terraform = await Container.getInstance().get(TerraformUtility);
 * const { errors, plans } = await terraform.plan('./infrastructure', { json: true });
 * const report = await octo.validate(app, { errors, plans });
 * ```
 *
 * @group Utilities/Terraform
 */
export class TerraformUtility {
  private onceArgs: string[] | undefined;

  private readonly options: {
    stateCheckInIntervalInMs: number;
    terraformBinary?: string;
    terragruntBinary: string;
    timeoutInMs: number;
  };

  /**
   * The timeout the caller asked for, or undefined when they asked for none. A command that changes
   * infrastructure is bounded only by this, never by the default.
   */
  private readonly requestedTimeoutInMs: number | undefined;

  /**
   * @param options Overrides for the binaries invoked, the per-command timeout, and the state
   * check-in interval. `terragruntBinary` defaults to `terragrunt`.
   *
   * `timeoutInMs` defaults to 60 minutes for the commands that only read - `plan`, `output`, `show`.
   * `apply` and `destroy` run unbounded unless it is given: a timeout there turns a slow apply into
   * one killed part way through a mutation, and how long a stack legitimately takes is a fact about
   * that stack rather than something a default can know. What bounds them instead is the caller -
   * a CI job's own timeout, or a person at a terminal.
   *
   * `stateCheckInIntervalInMs` is how often terraform state is checked into the state provider while
   * a command runs, 10 seconds by default. Terraform rewrites it as each resource completes.
   */
  constructor(
    options: {
      stateCheckInIntervalInMs?: number;
      terraformBinary?: string;
      terragruntBinary?: string;
      timeoutInMs?: number;
    } = {},
  ) {
    this.requestedTimeoutInMs = options.timeoutInMs;
    this.options = {
      stateCheckInIntervalInMs: options.stateCheckInIntervalInMs ?? DEFAULT_STATE_CHECK_IN_INTERVAL_IN_MS,
      terraformBinary: options.terraformBinary,
      terragruntBinary: options.terragruntBinary ?? 'terragrunt',
      timeoutInMs: options.timeoutInMs ?? DEFAULT_TIMEOUT_IN_MS,
    };
  }

  /**
   * Runs `terragrunt run --all -- apply` over every generated module folder.
   *
   * **This changes real infrastructure**, and runs with `-auto-approve`. Use
   * {@link TerraformUtility.findPlannedDestroys} beforehand if a destroy needs confirming.
   *
   * @param terragruntDir The directory octo generated the module folders into.
   * @param onOutput Called with each chunk terragrunt writes, as it writes it. An apply can run for
   * tens of minutes, and the buffered result only arrives at the end - without this the caller has
   * nothing to show for the whole run. The chunks are also still accumulated into the result.
   */
  async apply(
    terragruntDir: string,
    { onOutput }: { onOutput?: (chunk: string, stream: 'stderr' | 'stdout') => void } = {},
  ): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'apply', ['-input=false', '-auto-approve', ...this.consumeArgs()], { onOutput });
  }

  /**
   * Runs `terragrunt run --all -- destroy` over every generated module folder.
   *
   * **This tears down real infrastructure**, and runs with `-auto-approve`.
   */
  async destroy(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'destroy', ['-input=false', '-auto-approve', ...this.consumeArgs()]);
  }

  /**
   * Every address a set of plans will destroy, across all folders. A recreate (`create` + `delete`)
   * counts, since the old object is still destroyed.
   *
   * Lets a caller refuse to apply until the destroys have been shown, which {@link apply} cannot do on
   * its own because it runs with `-auto-approve`.
   */
  findPlannedDestroys(plans: Map<string, TerraformPlan>): { address: string; moduleId: string; tfActions: string[] }[] {
    const destroys: { address: string; moduleId: string; tfActions: string[] }[] = [];

    for (const [moduleId, plan] of plans.entries()) {
      for (const resourceChange of plan.resource_changes ?? []) {
        const tfActions = resourceChange.change?.actions ?? [];
        if (resourceChange.mode !== 'data' && tfActions.includes('delete')) {
          destroys.push({ address: resourceChange.address, moduleId, tfActions });
        }
      }
    }

    return destroys;
  }

  /**
   * Returns the immediate sub-directories of `terragruntDir` that look like generated module
   * folders (they contain a `terragrunt.hcl`). Each folder name is the octo `moduleId`.
   */
  async listModuleFolders(terragruntDir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(terragruntDir, { withFileTypes: true });
    } catch (error) {
      // A generate that produced no resources never creates the directory — that is "no module
      // folders", not an error.
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const moduleIds: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const folderEntries = await readdir(join(terragruntDir, entry.name));
      if (folderEntries.includes('terragrunt.hcl')) {
        moduleIds.push(entry.name);
      }
    }
    return moduleIds.sort();
  }

  /**
   * Reads the outputs of every generated module folder.
   *
   * @param terragruntDir The directory octo generated the module folders into.
   * @param options Pass `{ json: true }` to get the outputs parsed and keyed by `moduleId`, which is
   * the shape {@link Octo.commit} takes. Without it, terragrunt's raw output is returned.
   */
  output(terragruntDir: string, options: { json: true }): Promise<Map<string, TerraformOutputs>>;
  /**
   * @internal
   */
  output(terragruntDir: string, options?: { json?: false }): Promise<TerraformRawResult>;
  /**
   * @internal
   */
  async output(
    terragruntDir: string,
    options: { json?: boolean } = {},
  ): Promise<TerraformRawResult | Map<string, TerraformOutputs>> {
    if (!options.json) {
      return this.runAll(terragruntDir, 'output', this.consumeArgs());
    }

    const composedArgs = this.consumeArgs();
    const realTerragruntDir = await this.resolveRealPath(terragruntDir);
    return this.withTerraformState(realTerragruntDir, async (moduleIds) =>
      this.emitAround('output', terragruntDir, async () => {
        const outputs = new Map<string, TerraformOutputs>();
        for (const moduleId of moduleIds) {
          const moduleOutputs = await this.readOutputs(join(realTerragruntDir, moduleId), composedArgs);
          if (moduleOutputs !== undefined) {
            outputs.set(moduleId, moduleOutputs);
          }
        }
        return outputs;
      }),
    );
  }

  /**
   * Plans every generated module folder.
   *
   * @param terragruntDir The directory octo generated the module folders into.
   * @param options Pass `{ json: true }` to get the plans parsed and keyed by `moduleId`, which is
   * the shape {@link Octo.validate} takes - along with the `errors` of any folder that could not be
   * planned. Without it, terragrunt's raw output is returned.
   */
  plan(terragruntDir: string, options: { json: true }): Promise<TerraformPlanResult>;
  /**
   * @internal
   */
  plan(terragruntDir: string, options?: { json?: false }): Promise<TerraformRawResult>;
  /**
   * @internal
   */
  async plan(
    terragruntDir: string,
    options: { json?: boolean } = {},
  ): Promise<TerraformPlanResult | TerraformRawResult> {
    if (!options.json) {
      return this.runAll(terragruntDir, 'plan', ['-input=false', ...this.consumeArgs()]);
    }

    const composedArgs = this.consumeArgs();
    const realTerragruntDir = await this.resolveRealPath(terragruntDir);
    return this.withTerraformState(realTerragruntDir, async (moduleIds) =>
      this.emitAround('plan', terragruntDir, async () => {
        const errors = new Map<string, string>();
        const plans = new Map<string, TerraformPlan>();

        for (const moduleId of moduleIds) {
          const result = await this.readPlan(join(realTerragruntDir, moduleId), composedArgs);
          if ('plan' in result) {
            plans.set(moduleId, result.plan);
          } else {
            errors.set(moduleId, result.error);
          }
        }

        return { errors, plans };
      }),
    );
  }

  /**
   * To append extra CLI arguments to the *next* command only. Returns `this`, so it chains.
   */
  setArgsOnce(args: string[]): this {
    this.onceArgs = args;
    return this;
  }
  /**
   * Runs `terragrunt run --all -- validate` over every generated module folder, checking the generated
   * HCL is well-formed. Unrelated to {@link Octo.validate}, which compares plans against intent.
   */
  async validate(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'validate', this.consumeArgs());
  }
  /**
   * Runs `file` with `args`. `onOutput` receives each chunk as the child writes it; `execFile` keeps
   * accumulating into its own buffers regardless, so the resolved result is the same either way.
   */
  protected execFileAsync(
    file: string,
    args: string[],
    options: ExecFileOptionsWithStringEncoding,
    onOutput?: (chunk: string, stream: 'stderr' | 'stdout') => void,
  ): Promise<{
    stderr: string;
    stdout: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = execFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr: stderr ?? '', stdout: stdout ?? '' }));
        } else {
          resolve({ stderr: stderr ?? '', stdout: stdout ?? '' });
        }
      });

      if (onOutput) {
        child.stdout?.on('data', (chunk) => onOutput(String(chunk), 'stdout'));
        child.stderr?.on('data', (chunk) => onOutput(String(chunk), 'stderr'));
      }
    });
  }

  /**
   * The environment a terragrunt command runs with, carrying the terraform binary override.
   */
  private buildEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    env.TG_PROVIDER_CACHE ??= '1'; // Enable Terragrunt shared provider cache by default.
    // Resolves the paths a generated folder names relative to the project root. Terragrunt runs
    // terraform from a copy of the folder, so terraform cannot work the root out for itself.
    env[`TF_VAR_${PROJECT_ROOT_VARIABLE_NAME}`] ??= process.cwd();
    if (this.options.terraformBinary) {
      env.TG_TF_PATH = this.options.terraformBinary;
    }
    return env;
  }

  /**
   * Takes the arguments set by {@link TerraformUtility.setArgsOnce}, clearing them.
   */
  private consumeArgs(): string[] {
    const args = this.onceArgs ?? [];
    this.onceArgs = undefined;
    return args;
  }

  /**
   * Renders why one folder could not be planned.
   *
   * Terragrunt writes its diagnostics to stderr, which carries the `Error:` block, so that comes
   * first. The wrapped {@link TerraformCommandError} message is the fallback for failures that
   * produce no stderr, such as a malformed `show -json` payload failing at `JSON.parse`.
   */
  private describePlanFailure(error: unknown): string {
    const e = error as { message?: string; stderr?: string };
    return e.stderr?.trim() || e.message?.trim() || String(error);
  }

  /**
   * Publishes the same started/finished pair {@link runAll} does, around a body that drives
   * terragrunt folder by folder instead.
   *
   * The JSON-mode `plan` and `output` take that per-folder path, and it is the slowest step of a
   * `validate` - a full plan runs for tens of seconds - so the log must not fall silent through it.
   */
  private async emitAround<T>(command: string, terragruntDir: string, body: () => Promise<T>): Promise<T> {
    const eventService = EventService.getInstance();
    const startedAt = Date.now();
    eventService.emit(new TerraformCommandStartedEvent(command, { command, dir: terragruntDir }));

    try {
      const result = await body();
      eventService.emit(
        new TerraformCommandFinishedEvent(command, {
          command,
          dir: terragruntDir,
          durationInMs: Date.now() - startedAt,
          exitCode: 0,
        }),
      );
      return result;
    } catch (error) {
      eventService.emit(
        new TerraformCommandFinishedEvent(command, {
          command,
          dir: terragruntDir,
          durationInMs: Date.now() - startedAt,
          exitCode: (error as { exitCode?: number })?.exitCode ?? -1,
        }),
      );
      throw error;
    }
  }

  /**
   * The `terragrunt run --all` invocation itself, wrapped in its started/finished pair.
   */
  private async invokeRunAll(
    terragruntDir: string,
    command: string,
    commandArgs: string[],
    { onOutput }: { onOutput?: (chunk: string, stream: 'stderr' | 'stdout') => void } = {},
  ): Promise<TerraformRawResult> {
    const binary = this.options.terragruntBinary;
    const args = [
      '--non-interactive',
      '--no-color',
      '--working-dir',
      terragruntDir,
      'run',
      '--all',
      '--',
      command,
      ...commandArgs,
    ];

    const eventService = EventService.getInstance();
    const startedAt = Date.now();
    eventService.emit(new TerraformCommandStartedEvent(command, { command, dir: terragruntDir }));

    try {
      const { stderr, stdout } = await this.execFileAsync(
        binary,
        args,
        {
          env: this.buildEnv(),
          maxBuffer: MAX_BUFFER,
          timeout: MUTATING_COMMANDS.has(command) ? this.requestedTimeoutInMs : this.options.timeoutInMs,
        },
        onOutput,
      );

      eventService.emit(
        new TerraformCommandOutputEvent(command, { args, binary, dir: terragruntDir, exitCode: 0, stderr, stdout }),
      );
      eventService.emit(
        new TerraformCommandFinishedEvent(command, {
          command,
          dir: terragruntDir,
          durationInMs: Date.now() - startedAt,
          exitCode: 0,
        }),
      );

      return { args, exitCode: 0, stderr, stdout };
    } catch (error) {
      const commandError = this.toTerraformCommandError(binary, args, terragruntDir, error);
      eventService.emit(
        new TerraformCommandOutputEvent(command, {
          args,
          binary,
          dir: terragruntDir,
          exitCode: commandError.exitCode,
          stderr: commandError.stderr,
          stdout: commandError.stdout,
        }),
      );
      eventService.emit(
        new TerraformCommandFinishedEvent(command, {
          command,
          dir: terragruntDir,
          durationInMs: Date.now() - startedAt,
          exitCode: (commandError as unknown as { exitCode?: number }).exitCode ?? -1,
        }),
      );
      throw commandError;
    }
  }

  /**
   * Moves the terraform state of every move the last generate recorded out of its old module folder
   * into its new one, with `terraform state mv`, and copies the moved resources' outputs along, since
   * folders depending on the new one read them there. An address the old folder's state does not hold,
   * or the new one's already holds, is skipped, which is what a move already made leaves behind.
   * Records in `originalStates` what each state file held before its first move, `undefined` where none
   * existed.
   */
  private async moveStates(
    terragruntDir: string,
    moduleIds: string[],
    originalStates: Map<string, Buffer | undefined>,
  ): Promise<void> {
    const terraformStateService = await Container.getInstance().get(TerraformStateService);
    const moves = await terraformStateService.getRecordedMoves();

    const readAddresses = async (stateFilePath: string): Promise<Set<string>> => {
      try {
        const state = JSON.parse(await readFile(stateFilePath, 'utf-8')) as {
          resources?: { mode: string; name: string; type: string }[];
        };
        return new Set((state.resources ?? []).filter((r) => r.mode === 'managed').map((r) => `${r.type}.${r.name}`));
      } catch {
        return new Set();
      }
    };

    let tempDir: string | undefined;
    try {
      for (const { addresses, fromModuleId, moduleId, outputs } of moves) {
        if (!moduleIds.includes(fromModuleId) || !moduleIds.includes(moduleId)) {
          continue;
        }

        // Find the addresses still to move.
        const fromStateFilePath = resolve(terragruntDir, fromModuleId, TERRAFORM_STATE_FILE_NAME);
        const toStateFilePath = resolve(terragruntDir, moduleId, TERRAFORM_STATE_FILE_NAME);
        const [fromAddresses, toAddresses] = await Promise.all([
          readAddresses(fromStateFilePath),
          readAddresses(toStateFilePath),
        ]);
        const movableAddresses = addresses.filter(({ from, to }) => fromAddresses.has(from) && !toAddresses.has(to));
        if (movableAddresses.length === 0) {
          continue;
        }

        // Keep what both state files held before their first move.
        for (const stateFilePath of [fromStateFilePath, toStateFilePath]) {
          if (!originalStates.has(stateFilePath)) {
            originalStates.set(stateFilePath, existsSync(stateFilePath) ? await readFile(stateFilePath) : undefined);
          }
        }

        // Move each address, writing terraform's backups outside the module folders.
        tempDir ??= await mkdtemp(join(tmpdir(), 'octo-tfstate-'));
        for (const { from, to } of movableAddresses) {
          await this.runIn(tempDir, this.options.terraformBinary ?? 'terraform', [
            'state',
            'mv',
            '-lock=false',
            `-state=${fromStateFilePath}`,
            `-state-out=${toStateFilePath}`,
            `-backup=${join(tempDir, `${fromModuleId}-${from}.backup`)}`,
            `-backup-out=${join(tempDir, `${moduleId}-${to}.backup`)}`,
            from,
            to,
          ]);
        }

        // Copy the outputs the moved resources published.
        const fromState = JSON.parse(await readFile(fromStateFilePath, 'utf-8')) as {
          outputs?: Record<string, unknown>;
        };
        const toState = JSON.parse(await readFile(toStateFilePath, 'utf-8')) as {
          outputs?: Record<string, unknown>;
          serial: number;
        };
        toState.outputs ??= {};
        for (const { from, to } of outputs) {
          if (fromState.outputs?.[from] !== undefined && toState.outputs[to] === undefined) {
            toState.outputs[to] = fromState.outputs[from];
          }
        }
        toState.serial++;
        await writeFile(toStateFilePath, JSON.stringify(toState, null, 2));
      }
    } finally {
      if (tempDir) {
        await rm(tempDir, { force: true, recursive: true });
      }
    }
  }

  /**
   * Runs `terragrunt output -json` in one module folder.
   *
   * A folder whose output fails is reported as `undefined`, not thrown — one bad module folder must not
   * abort every other folder's result.
   */
  private async readOutputs(moduleDir: string, composedArgs: string[]): Promise<TerraformOutputs | undefined> {
    try {
      const { stdout } = await this.run(moduleDir, ['output', '-json', ...composedArgs]);
      return JSON.parse(stdout) as TerraformOutputs;
    } catch {
      return undefined;
    }
  }

  /**
   * Runs `terragrunt plan -out=<planFile>` followed by `terragrunt show -json <planFile>` in one module folder.
   *
   * The plan file is written to an absolute temp path, never inside a terragrunt
   * cache — terragrunt picks a different cache sub-directory per invocation, so a relative plan file
   * written by one command cannot be found by the next.
   *
   * A folder whose plan/show/parse fails is reported as an `error`, not thrown — one bad module folder must not
   * abort every other folder's result. The failure is carried so `validate` can report it verbatim.
   */
  private async readPlan(
    moduleDir: string,
    composedArgs: string[],
  ): Promise<{ error: string } | { plan: TerraformPlan }> {
    const tempDir = await mkdtemp(join(tmpdir(), 'octo-tfplan-'));
    const planFile = join(tempDir, 'octo.tfplan');

    try {
      await this.run(moduleDir, ['plan', `-out=${planFile}`, '-input=false', ...composedArgs]);
      const { stdout } = await this.run(moduleDir, ['show', '-json', planFile]);
      return { plan: JSON.parse(stdout) as TerraformPlan };
    } catch (error) {
      return { error: this.describePlanFailure(error) };
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  }

  /**
   * The directory with every symbolic link on its path resolved, or the directory as given when it does
   * not exist. Terragrunt drops `dependency` blocks when its working directory is reached through a
   * symbolic link, as macOS's temporary directory is.
   */
  private async resolveRealPath(dir: string): Promise<string> {
    try {
      return await realpath(dir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return dir;
      }
      throw error;
    }
  }

  /**
   * Writes back what each state file held before {@link TerraformUtility.moveStates}, deleting one that
   * did not exist.
   */
  private async restoreStates(originalStates: Map<string, Buffer | undefined>): Promise<void> {
    for (const [stateFilePath, data] of originalStates.entries()) {
      if (data === undefined) {
        await rm(stateFilePath, { force: true });
      } else {
        await writeFile(stateFilePath, data);
      }
    }
  }

  /**
   * Runs one terragrunt command in a single module folder (`cwd` = that folder).
   */
  private async run(moduleDir: string, args: string[]): Promise<TerraformRawResult> {
    return this.runIn(moduleDir, this.options.terragruntBinary, args);
  }

  /**
   * Runs `terragrunt run --all -- <command>` across every module folder under `terragruntDir`, with
   * the terraform state of every folder checked out around it.
   */
  private async runAll(
    terragruntDir: string,
    command: string,
    commandArgs: string[],
    { onOutput }: { onOutput?: (chunk: string, stream: 'stderr' | 'stdout') => void } = {},
  ): Promise<TerraformRawResult> {
    const realTerragruntDir = await this.resolveRealPath(terragruntDir);
    return this.withTerraformState(
      realTerragruntDir,
      () => this.invokeRunAll(realTerragruntDir, command, commandArgs, { onOutput }),
      { keepMoves: MUTATING_COMMANDS.has(command) },
    );
  }

  /**
   * Runs `binary` with `args` in `dir`.
   */
  private async runIn(dir: string, binary: string, args: string[]): Promise<TerraformRawResult> {
    const eventService = EventService.getInstance();

    try {
      const { stderr, stdout } = await this.execFileAsync(binary, args, {
        cwd: dir,
        env: this.buildEnv(),
        maxBuffer: MAX_BUFFER,
        timeout: this.options.timeoutInMs,
      });
      eventService.emit(new TerraformCommandOutputEvent(args[0], { args, binary, dir, exitCode: 0, stderr, stdout }));
      return { args, exitCode: 0, stderr, stdout };
    } catch (error) {
      const commandError = this.toTerraformCommandError(binary, args, dir, error);
      eventService.emit(
        new TerraformCommandOutputEvent(args[0], {
          args,
          binary,
          dir,
          exitCode: commandError.exitCode,
          stderr: commandError.stderr,
          stdout: commandError.stdout,
        }),
      );
      throw commandError;
    }
  }

  /**
   * Wraps whatever a failed spawn threw into a {@link TerraformCommandError}.
   */
  private toTerraformCommandError(binary: string, args: string[], dir: string, error: unknown): TerraformCommandError {
    const e = error as { code?: number | string; message?: string; stderr?: string; stdout?: string };
    const exitCode = typeof e.code === 'number' ? e.code : -1;
    const message = `Failed to run "${binary} ${args.join(' ')}" in "${dir}" (exit ${exitCode}): ${
      e.stderr || e.message || String(error)
    }`;
    return new TerraformCommandError(message, args, exitCode, e.stdout ?? '', e.stderr ?? '');
  }

  /**
   * Checks every module folder's terraform state out of Octo's state provider, moves the state of every
   * resource generate moved between folders, runs `body`, and checks the state back in.
   *
   * Only a command that changes infrastructure (`keepMoves`) checks the moves in. Any other runs on them
   * and puts back what the state files held before, so a move nobody applied never reaches the provider.
   *
   * The check-in runs on the way out of a failure as much as a success, because what terraform has
   * already built is real whether or not the command that built it returned cleanly. A timer checks
   * in through the command as well, bounding what a killed runner loses.
   *
   * A failed command keeps its own error when the check-in after it fails too; the check-in's error
   * is printed on stderr. The folder's state is ahead of the provider's then, and the next run keeps
   * it and checks it in.
   */
  private async withTerraformState<T>(
    terragruntDir: string,
    body: (moduleIds: string[]) => Promise<T>,
    { keepMoves = false }: { keepMoves?: boolean } = {},
  ): Promise<T> {
    const terraformStateService = await Container.getInstance().get(TerraformStateService);
    const moduleIds = await this.listModuleFolders(terragruntDir);
    const originalStates = new Map<string, Buffer | undefined>();

    await terraformStateService.checkOut(terragruntDir, moduleIds);

    const checkIn = async (): Promise<void> => {
      terraformStateService.stopPeriodicCheckIn();
      if (!keepMoves) {
        await this.restoreStates(originalStates);
      }
      await terraformStateService.checkIn(terragruntDir, moduleIds);
    };

    let result: T;
    try {
      await this.moveStates(terragruntDir, moduleIds, originalStates);
      if (keepMoves || originalStates.size === 0) {
        terraformStateService.startPeriodicCheckIn(terragruntDir, moduleIds, this.options.stateCheckInIntervalInMs);
      }

      result = await body(moduleIds);
    } catch (error) {
      // Keep the error of the command, which is the one the user has to act on.
      await checkIn().catch((checkInError) => {
        process.stderr.write(`Failed to check terraform state in: ${checkInError?.message ?? String(checkInError)}\n`);
      });
      throw error;
    }

    await checkIn();
    return result;
  }
}

/**
 * @internal
 */
@Factory<TerraformUtility>(TerraformUtility)
export class TerraformUtilityFactory {
  private static instance: TerraformUtility;

  /**
   * @internal
   */
  static async create(
    options: ConstructorParameters<typeof TerraformUtility>[0] = {},
    forceNew: boolean = false,
  ): Promise<TerraformUtility> {
    if (!this.instance) {
      this.instance = new TerraformUtility(options);
    }

    if (forceNew) {
      this.instance = new TerraformUtility(options);
    }

    return this.instance;
  }
}
