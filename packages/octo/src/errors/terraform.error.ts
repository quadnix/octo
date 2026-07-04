/**
 * @group Errors/Terraform
 */
export class TerraformCommandError extends Error {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;

  constructor(message: string, args: string[], exitCode: number, stdout: string, stderr: string) {
    super(message);

    this.args = args;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;

    Object.setPrototypeOf(this, TerraformCommandError.prototype);
  }
}
