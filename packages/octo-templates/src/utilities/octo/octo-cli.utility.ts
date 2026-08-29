import { spawn } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BIN_DIRECTORY = resolve(__dirname, '..', '..', '..', 'node_modules', '.bin');

const OUTPUT_DIRECTORY = join('.octo', 'generated');

/**
 * Drives a template through the `octo` CLI, the way a user does.
 *
 * A template whose resources are all managed by terraform can be driven in-process through
 * `TestModuleContainer`. One holding an external resource cannot: terraform shells back out to
 * `octo run-action` mid-apply, and that is a second process, which finds the modules through the
 * definition file and the prior state through the state provider the definition names. Only a real
 * CLI run puts both of those where the callback will look.
 *
 * The CLI's own bin directory is prepended to `PATH` for the same reason - the callback invokes
 * `octo` by bare name.
 */
export class OctoCliUtility {
  /**
   * Runs the full lifecycle against the given definition: lock, generate, validate, apply, commit.
   *
   * The lock is released by `commit`, however that ends, and by an explicit unlock when an earlier
   * step is what failed - a lock left behind blocks the next run, including the teardown.
   */
  static async lifecycle(
    projectDirectory: string,
    definitionFilePath: string,
    environment: Record<string, string> = {},
  ): Promise<void> {
    const lockId = (await OctoCliUtility.run(projectDirectory, definitionFilePath, ['lock'], environment)).trim();

    try {
      await OctoCliUtility.run(projectDirectory, definitionFilePath, ['generate', '--outputDir', OUTPUT_DIRECTORY], environment);
      await OctoCliUtility.run(projectDirectory, definitionFilePath, ['validate', '--terragruntDir', OUTPUT_DIRECTORY], environment);
      await OctoCliUtility.run(
        projectDirectory,
        definitionFilePath,
        ['apply', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId, '--auto-approve'],
        environment,
      );
      await OctoCliUtility.run(
        projectDirectory,
        definitionFilePath,
        ['commit', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId],
        environment,
      );
    } catch (error) {
      await OctoCliUtility.run(projectDirectory, definitionFilePath, ['unlock', '--force'], environment).catch(
        () => undefined,
      );
      throw error;
    }
  }

  /**
   * Runs one `octo` command, returning its stdout. Its stderr is forwarded as it arrives, because an
   * apply runs for minutes and its progress is the only sign it is alive.
   *
   * @throws If the command exits non-zero. The error carries everything the command printed.
   */
  static run(
    projectDirectory: string,
    definitionFilePath: string,
    args: string[],
    environment: Record<string, string> = {},
  ): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(join(BIN_DIRECTORY, 'octo'), args, {
        cwd: projectDirectory,
        env: {
          ...process.env,
          ...environment,
          OCTO_DEFINITION_FILE_PATH: definitionFilePath,
          PATH: [BIN_DIRECTORY, process.env.PATH ?? ''].join(delimiter),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        process.stderr.write(chunk);
      });

      child.on('error', (error) => reject(new Error(`Could not run "octo ${args[0]}"! ${error.message}`)));
      child.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolvePromise(stdout);
        } else {
          reject(new Error(`"octo ${args[0]}" exited with ${exitCode}!\n${stdout}\n${stderr}`));
        }
      });
    });
  }
}
