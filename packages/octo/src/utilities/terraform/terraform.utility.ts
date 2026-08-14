import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Factory } from '../../decorators/factory.decorator.js';
import { TerraformCommandError } from '../../errors/index.js';
import { TerraformCommandFinishedEvent, TerraformCommandStartedEvent } from '../../events/index.js';
import type { TerraformOutputs } from '../../modes/commit.mode.js';
import type { TerraformPlan } from '../../modes/validate.mode.js';
import { EventService } from '../../services/event/event.service.js';

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

export class TerraformUtility {
  private onceArgs: string[] | undefined;

  private readonly options: {
    terraformBinary?: string;
    terragruntBinary: string;
    timeoutInMs: number;
  };

  constructor(options: { terraformBinary?: string; terragruntBinary?: string; timeoutInMs?: number } = {}) {
    this.options = {
      terraformBinary: options.terraformBinary,
      terragruntBinary: options.terragruntBinary ?? 'terragrunt',
      timeoutInMs: options.timeoutInMs ?? DEFAULT_TIMEOUT_IN_MS,
    };
  }

  async apply(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'apply', ['-input=false', '-auto-approve', ...this.consumeArgs()]);
  }

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

  output(terragruntDir: string, options: { json: true }): Promise<Map<string, TerraformOutputs>>;
  output(terragruntDir: string, options?: { json?: false }): Promise<TerraformRawResult>;
  async output(
    terragruntDir: string,
    options: { json?: boolean } = {},
  ): Promise<TerraformRawResult | Map<string, TerraformOutputs>> {
    if (!options.json) {
      return this.runAll(terragruntDir, 'output', this.consumeArgs());
    }

    const composedArgs = this.consumeArgs();
    const outputs = new Map<string, TerraformOutputs>();
    for (const moduleId of await this.listModuleFolders(terragruntDir)) {
      const moduleOutputs = await this.readOutputs(join(terragruntDir, moduleId), composedArgs);
      if (moduleOutputs !== undefined) {
        outputs.set(moduleId, moduleOutputs);
      }
    }
    return outputs;
  }

  plan(terragruntDir: string, options: { json: true }): Promise<TerraformPlanResult>;
  plan(terragruntDir: string, options?: { json?: false }): Promise<TerraformRawResult>;
  async plan(
    terragruntDir: string,
    options: { json?: boolean } = {},
  ): Promise<TerraformPlanResult | TerraformRawResult> {
    if (!options.json) {
      return this.runAll(terragruntDir, 'plan', ['-input=false', ...this.consumeArgs()]);
    }

    const composedArgs = this.consumeArgs();
    const errors = new Map<string, string>();
    const plans = new Map<string, TerraformPlan>();

    for (const moduleId of await this.listModuleFolders(terragruntDir)) {
      const result = await this.readPlan(join(terragruntDir, moduleId), composedArgs);
      if ('plan' in result) {
        plans.set(moduleId, result.plan);
      } else {
        errors.set(moduleId, result.error);
      }
    }

    return { errors, plans };
  }

  setArgsOnce(args: string[]): this {
    this.onceArgs = args;
    return this;
  }
  async validate(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'validate', this.consumeArgs());
  }
  protected execFileAsync(
    file: string,
    args: string[],
    options: ExecFileOptionsWithStringEncoding,
  ): Promise<{
    stderr: string;
    stdout: string;
  }> {
    return new Promise((resolve, reject) => {
      execFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr: stderr ?? '', stdout: stdout ?? '' }));
        } else {
          resolve({ stderr: stderr ?? '', stdout: stdout ?? '' });
        }
      });
    });
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    env.TG_PROVIDER_CACHE ??= '1'; // Enable Terragrunt shared provider cache by default.
    if (this.options.terraformBinary) {
      env.TG_TF_PATH = this.options.terraformBinary;
    }
    return env;
  }

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
   * Runs `terragrunt run --all -- <command>` across every module folder under `terragruntDir`.
   */
  private async runAll(terragruntDir: string, command: string, commandArgs: string[]): Promise<TerraformRawResult> {
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
      const { stderr, stdout } = await this.execFileAsync(binary, args, {
        env: this.buildEnv(),
        maxBuffer: MAX_BUFFER,
        timeout: this.options.timeoutInMs,
      });

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

  private toTerraformCommandError(binary: string, args: string[], dir: string, error: unknown): TerraformCommandError {
    const e = error as { code?: number | string; message?: string; stderr?: string; stdout?: string };
    const exitCode = typeof e.code === 'number' ? e.code : -1;
    const message = `Failed to run "${binary} ${args.join(' ')}" in "${dir}" (exit ${exitCode}): ${
      e.stderr || e.message || String(error)
    }`;
    return new TerraformCommandError(message, args, exitCode, e.stdout ?? '', e.stderr ?? '');
  }
}

/**
 * @internal
 */
@Factory<TerraformUtility>(TerraformUtility)
export class TerraformUtilityFactory {
  private static instance: TerraformUtility;

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
