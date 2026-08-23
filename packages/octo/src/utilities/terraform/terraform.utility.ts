import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Factory } from '../../decorators/factory.decorator.js';
import { TerraformCommandError } from '../../errors/index.js';
import { TerraformCommandFinishedEvent, TerraformCommandStartedEvent } from '../../events/index.js';
import { Container } from '../../functions/container/container.js';
import type { TerraformOutputs } from '../../modes/commit.mode.js';
import type { TerraformPlan } from '../../modes/validate.mode.js';
import { EventService } from '../../services/event/event.service.js';
import { TerraformStateService } from '../../services/state-management/terraform-state.service.js';
import { PROJECT_ROOT_VARIABLE_NAME } from '../../services/terraform/terraform.type.js';

const DEFAULT_TIMEOUT_IN_MS = 60 * 60 * 1000; // 60 minutes.
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
    terraformBinary?: string;
    terragruntBinary: string;
    timeoutInMs: number;
  };

  /**
   * @param options Overrides for the binaries invoked and the per-command timeout. `terragruntBinary`
   * defaults to `terragrunt`, and `timeoutInMs` to 60 minutes.
   */
  constructor(options: { terraformBinary?: string; terragruntBinary?: string; timeoutInMs?: number } = {}) {
    this.options = {
      terraformBinary: options.terraformBinary,
      terragruntBinary: options.terragruntBinary ?? 'terragrunt',
      timeoutInMs: options.timeoutInMs ?? DEFAULT_TIMEOUT_IN_MS,
    };
  }

  /**
   * Runs `terragrunt run-all apply` over every generated module folder.
   *
   * **This changes real infrastructure**, and runs with `-auto-approve`. Use
   * {@link TerraformUtility.findPlannedDestroys} beforehand if a destroy needs confirming.
   *
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
   * Runs `terragrunt run-all destroy` over every generated module folder.
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
    return this.withTerraformState(terragruntDir, async (moduleIds) =>
      this.emitAround('output', terragruntDir, async () => {
        const outputs = new Map<string, TerraformOutputs>();
        for (const moduleId of moduleIds) {
          const moduleOutputs = await this.readOutputs(join(terragruntDir, moduleId), composedArgs);
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
    return this.withTerraformState(terragruntDir, async (moduleIds) =>
      this.emitAround('plan', terragruntDir, async () => {
        const errors = new Map<string, string>();
        const plans = new Map<string, TerraformPlan>();

        for (const moduleId of moduleIds) {
          const result = await this.readPlan(join(terragruntDir, moduleId), composedArgs);
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
   * Runs `terragrunt run-all validate` over every generated module folder, checking the generated
   * HCL is well-formed. Unrelated to {@link Octo.validate}, which compares plans against intent.
   */
  async validate(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'validate', this.consumeArgs());
  }
  /**
   * @param onOutput Receives each chunk as the child writes it. `execFile` keeps accumulating into
   * its own buffers regardless, so the resolved result is unchanged whether or not this is passed.
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
          timeout: this.options.timeoutInMs,
        },
        onOutput,
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
   * Runs one terragrunt command in a single module folder (`cwd` = that folder).
   */
  private async run(moduleDir: string, args: string[]): Promise<TerraformRawResult> {
    const binary = this.options.terragruntBinary;

    try {
      const { stderr, stdout } = await this.execFileAsync(binary, args, {
        cwd: moduleDir,
        env: this.buildEnv(),
        maxBuffer: MAX_BUFFER,
        timeout: this.options.timeoutInMs,
      });
      return { args, exitCode: 0, stderr, stdout };
    } catch (error) {
      throw this.toTerraformCommandError(binary, args, moduleDir, error);
    }
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
    return this.withTerraformState(terragruntDir, () =>
      this.invokeRunAll(terragruntDir, command, commandArgs, { onOutput }),
    );
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
   * Checks every module folder's terraform state out of Octo's state provider, runs `body`, and
   * checks it back in.
   *
   * The check-in runs on the way out of a failure as much as a success, because what terraform has
   * already built is real whether or not the command that built it returned cleanly. A timer checks
   * in through the command as well, bounding what a killed runner loses.
   */
  private async withTerraformState<T>(terragruntDir: string, body: (moduleIds: string[]) => Promise<T>): Promise<T> {
    const terraformStateService = await Container.getInstance().get(TerraformStateService);
    const moduleIds = await this.listModuleFolders(terragruntDir);

    await terraformStateService.checkOut(terragruntDir, moduleIds);
    terraformStateService.startPeriodicCheckIn(terragruntDir, moduleIds);

    try {
      return await body(moduleIds);
    } finally {
      terraformStateService.stopPeriodicCheckIn();
      await terraformStateService.checkIn(terragruntDir, moduleIds);
    }
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
