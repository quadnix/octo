import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Factory } from '../../decorators/factory.decorator.js';
import { TerraformCommandError } from '../../errors/index.js';
import type { TerraformOutputs } from '../../modes/commit.mode.js';
import type { TerraformPlan } from '../../modes/validate.mode.js';

const DEFAULT_TIMEOUT_IN_MS = 5 * 60 * 1000; // 5 minutes.
const MAX_BUFFER = 256 * 1024 * 1024; // 256 KB.

interface TerraformRawResult {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
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

  private buildEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
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

  async destroy(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'destroy', ['-input=false', '-auto-approve', ...this.consumeArgs()]);
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

  /**
   * Returns the immediate sub-directories of `terragruntDir` that look like generated module
   * folders (they contain a `terragrunt.hcl`). Each folder name is the octo `moduleId`.
   */
  async listModuleFolders(terragruntDir: string): Promise<string[]> {
    const entries = await readdir(terragruntDir, { withFileTypes: true });
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

  plan(terragruntDir: string, options: { json: true }): Promise<Map<string, TerraformPlan>>;
  plan(terragruntDir: string, options?: { json?: false }): Promise<TerraformRawResult>;
  async plan(
    terragruntDir: string,
    options: { json?: boolean } = {},
  ): Promise<TerraformRawResult | Map<string, TerraformPlan>> {
    if (!options.json) {
      return this.runAll(terragruntDir, 'plan', ['-input=false', ...this.consumeArgs()]);
    }

    const composedArgs = this.consumeArgs();
    const plans = new Map<string, TerraformPlan>();
    for (const moduleId of await this.listModuleFolders(terragruntDir)) {
      const plan = await this.readPlan(join(terragruntDir, moduleId), composedArgs);
      if (plan !== undefined) {
        plans.set(moduleId, plan);
      }
    }
    return plans;
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
   * A folder whose plan/show/parse fails is reported as `undefined`, not thrown — one bad module folder must not
   * abort every other folder's result.
   */
  private async readPlan(moduleDir: string, composedArgs: string[]): Promise<TerraformPlan | undefined> {
    const tempDir = await mkdtemp(join(tmpdir(), 'octo-tfplan-'));
    const planFile = join(tempDir, 'octo.tfplan');

    try {
      await this.run(moduleDir, ['plan', `-out=${planFile}`, '-input=false', ...composedArgs]);
      const { stdout } = await this.run(moduleDir, ['show', '-json', planFile]);
      return JSON.parse(stdout) as TerraformPlan;
    } catch {
      return undefined;
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
      const { stdout, stderr } = await this.execFileAsync(binary, args, {
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

    try {
      const { stdout, stderr } = await this.execFileAsync(binary, args, {
        env: this.buildEnv(),
        maxBuffer: MAX_BUFFER,
        timeout: this.options.timeoutInMs,
      });
      return { args, exitCode: 0, stderr, stdout };
    } catch (error) {
      throw this.toTerraformCommandError(binary, args, terragruntDir, error);
    }
  }

  setArgsOnce(args: string[]): this {
    this.onceArgs = args;
    return this;
  }

  private toTerraformCommandError(binary: string, args: string[], dir: string, error: unknown): TerraformCommandError {
    const e = error as { code?: number | string; message?: string; stderr?: string; stdout?: string };
    const exitCode = typeof e.code === 'number' ? e.code : -1;
    const message = `Failed to run "${binary} ${args.join(' ')}" in "${dir}" (exit ${exitCode}): ${
      e.stderr || e.message || String(error)
    }`;
    return new TerraformCommandError(message, args, exitCode, e.stdout ?? '', e.stderr ?? '');
  }

  async validate(terragruntDir: string): Promise<TerraformRawResult> {
    return this.runAll(terragruntDir, 'validate', this.consumeArgs());
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
