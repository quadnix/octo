import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
