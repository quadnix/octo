import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const IGNORED_DIRECTORIES = new Set(['.terraform', '.terragrunt-cache']);

const RESOURCE_BLOCK_REGEX = /resource\s+"([^"]+)"\s+"([^"]+)"/g;

interface TerragruntResult {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export class TerragruntRunner {
  constructor(
    private readonly workingDir: string,
    private readonly options: { awsRegion?: string; terragruntBinary?: string; timeoutMs?: number } = {},
  ) {}

  /**
   * Walks the runner's working directory and returns every Terraform resource address
   * (`<type>.<name>`) declared across its `.tf` files.
   */
  async collectTerraformResources(): Promise<string[]> {
    const resources: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { encoding: 'utf8', withFileTypes: true }).catch((error) => {
        if (error.code === 'ENOENT') {
          return []; // generateHcl wrote nothing — an empty tree is the expected result here.
        }
        throw error;
      });

      for (const entry of entries) {
        const entryPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) {
            await walk(entryPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.tf')) {
          const contents = await readFile(entryPath, 'utf8');
          for (const match of contents.matchAll(RESOURCE_BLOCK_REGEX)) {
            resources.push(`${match[1]}.${match[2]}`);
          }
        }
      }
    };

    await walk(this.workingDir);
    return resources;
  }

  async plan(): Promise<TerragruntResult> {
    return this.runAll('plan', '-input=false');
  }

  async runAll(command: string, ...commandArgs: string[]): Promise<TerragruntResult> {
    const binary = this.options.terragruntBinary || 'terragrunt';
    const awsRegion = this.options.awsRegion || 'us-east-1';
    const args = [
      '--non-interactive',
      '--no-color',
      '--working-dir',
      this.workingDir,
      'run',
      '--all',
      '--',
      command,
      ...commandArgs,
    ];

    try {
      const { stdout, stderr } = await execFileAsync(binary, args, {
        env: { ...process.env, AWS_DEFAULT_REGION: awsRegion, AWS_REGION: awsRegion },
        maxBuffer: 32 * 1024 * 1024,
        timeout: this.options.timeoutMs || 5 * 60 * 1000,
      });
      return { args, exitCode: 0, stderr, stdout };
    } catch (error) {
      const e = error as { code?: number; stderr?: string; stdout?: string };
      const stdout = e.stdout ?? '';
      const stderr = e.stderr ?? '';
      throw new Error(
        `terragrunt ${args.join(' ')} failed (exit ${e.code ?? 'unknown'}):\n` +
          `----- stdout -----\n${stdout}\n----- stderr -----\n${stderr}`,
      );
    }
  }

  async validate(): Promise<TerragruntResult> {
    return this.runAll('validate');
  }
}
