import { type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio, spawn } from 'child_process';

/**
 * Spawns the child processes a build job runs.
 */
export class ProcessUtility {
  /**
   * Runs a shell command detached, with its output piped to `outputWriter`.
   *
   * @returns The child process, so the caller can watch or kill it.
   */
  static runDetachedProcess(
    command: string,
    options: SpawnOptionsWithoutStdio,
    outputWriter: any,
  ): ChildProcessWithoutNullStreams {
    options = options || {};
    options.detached = true;
    options.stdio = ['ignore', outputWriter, outputWriter];
    options.env = options.env || {};

    let firstSpaceIndex = command.indexOf(' ');
    firstSpaceIndex = firstSpaceIndex === -1 ? command.length : firstSpaceIndex;

    const program = command.substring(0, firstSpaceIndex);
    const parameters = [command.substring(firstSpaceIndex + 1)];
    return spawn(program, parameters, options);
  }
}
