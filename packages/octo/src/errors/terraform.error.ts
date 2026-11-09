/**
 * Thrown when a terraform or terragrunt command exits non-zero. Carries the command's arguments, exit code,
 * the stdout of a command asked for JSON, and the end of its stderr.
 *
 * @group Errors/Terraform
 */
export class TerraformCommandError extends Error {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;

  /**
   * @param message The error message.
   * @param args The arguments the command was invoked with.
   * @param exitCode The command's exit code.
   * @param stdout The command's standard output, kept only for a command asked for JSON.
   * @param stderr The last 64 KB the command wrote to standard error.
   */
  constructor(message: string, args: string[], exitCode: number, stdout: string, stderr: string) {
    super(message);

    this.args = args;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;

    Object.setPrototypeOf(this, TerraformCommandError.prototype);
  }
}

/**
 * Thrown when terraform returns JSON in a shape octo does not read, naming the module folder it came
 * from.
 *
 * @group Errors/Terraform
 */
export class TerraformFormatError extends Error {
  readonly moduleDir: string;

  /**
   * @param message The error message.
   * @param moduleDir The module folder whose command returned the JSON.
   */
  constructor(message: string, moduleDir: string) {
    super(message);

    this.moduleDir = moduleDir;

    Object.setPrototypeOf(this, TerraformFormatError.prototype);
  }
}
