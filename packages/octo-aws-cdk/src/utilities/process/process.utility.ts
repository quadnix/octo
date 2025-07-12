import { type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio, spawn } from 'child_process';

/**
 * @internal
 */
export class ProcessUtility {
  static runDetachedProcess(
    command: string,
    options: SpawnOptionsWithoutStdio,
    outputWriter: any,
  ): ChildProcessWithoutNullStreams {
    options = options || {};
    options.detached = true;
    options.stdio = ['ignore', outputWriter, outputWriter];

    let firstSpaceIndex = command.indexOf(' ');
    firstSpaceIndex = firstSpaceIndex === -1 ? command.length : firstSpaceIndex;

    const program = command.substring(0, firstSpaceIndex);
    const parameters = [command.substring(firstSpaceIndex + 1)];
    return spawn(program, parameters, options);
  }
}
