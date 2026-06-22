import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * One module's parsed `terraform output -json`: a flat map of output name to value.
 */
export type TerraformOutputs = Record<string, { value: unknown }>;

/**
 * One module's parsed `terraform show -json` plan; only `resource_changes` is consumed by octo.
 */
export type TerraformPlan = {
  resource_changes?: { address: string; change?: { actions?: string[] }; mode?: string }[];
};

/**
 * Drives Terragrunt to extract machine-readable JSON out of a generated module folder.
 *
 * Terragrunt writes its own diagnostics to stderr and forwards the underlying tofu/terraform `-json`
 * payload to stdout untouched, so parsing stdout as JSON is safe.
 */
export class TerragruntUtility {
  /**
   * Returns the immediate sub-directories of `terragruntDir` that look like generated module
   * folders (they contain a `terragrunt.hcl`). Each folder name is the octo `moduleId`.
   */
  static async listModuleFolders(terragruntDir: string): Promise<string[]> {
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

  /**
   * Runs `terragrunt output -json` in a module folder and returns the parsed outputs map.
   */
  static async readOutputs(moduleDir: string): Promise<TerraformOutputs> {
    return this.runJson(moduleDir, ['output', '-json']);
  }

  /**
   * Runs `terragrunt plan -out=<planFile>` (terragrunt auto-inits) followed by
   * `terragrunt show -json <planFile>`. The plan file is written to an absolute temp path, never
   * inside a terragrunt cache — terragrunt picks a different cache sub-directory per invocation, so a
   * relative plan file written by one command is not findable by the next. (The generated
   * `terragrunt.hcl` pins backend state to a fixed path, so a stray plan-time cache directory does
   * not affect the state a later `commit` reads.)
   */
  static async readPlan(moduleDir: string): Promise<TerraformPlan> {
    const tempDir = await mkdtemp(join(tmpdir(), 'octo-tfplan-'));
    const planFile = join(tempDir, 'octo.tfplan');
    try {
      await TerragruntUtility.run(moduleDir, ['plan', `-out=${planFile}`, '-input=false']);
      return await TerragruntUtility.runJson(moduleDir, ['show', '-json', planFile]);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  }

  private static async run(moduleDir: string, args: string[]): Promise<void> {
    try {
      await execFileAsync('terragrunt', args, {
        cwd: moduleDir,
        env: process.env,
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(
        `Failed to run "terragrunt ${args.join(' ')}" in "${moduleDir}": ${error?.stderr || error?.message || String(error)}`,
      );
    }
  }

  private static async runJson(moduleDir: string, args: string[]): Promise<any> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('terragrunt', args, {
        cwd: moduleDir,
        env: process.env,
        maxBuffer: 256 * 1024 * 1024,
      }));
    } catch (error) {
      throw new Error(
        `Failed to run "terragrunt ${args.join(' ')}" in "${moduleDir}": ${error?.stderr || error?.message || String(error)}`,
      );
    }

    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`"terragrunt ${args.join(' ')}" in "${moduleDir}" did not return valid JSON: ${error?.message}`);
    }
  }
}
