import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio, spawn } from 'child_process';

export class ProcessUtility {
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
