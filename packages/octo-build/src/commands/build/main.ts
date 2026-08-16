import type { ChildProcessWithoutNullStreams } from 'child_process';
import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import pLimit from 'p-limit';
import { ProcessUtility } from '../../utilities/process/process.utility.js';
import type { IBuildConfiguration } from './models/build-configuration.interface.js';
import type { IRunArguments } from './models/run-arguments.interface.js';
import { StreamManager } from './streams/stream-manager.js';

/**
 * @internal
 */
/**
 * Runs the jobs of a `build.yml`, respecting their dependencies and the concurrency limit.
 */
export class Main {
  /**
   * @param args The parsed CLI arguments.
   * @param configuration The parsed build file.
   */
  constructor(
    private readonly args: IRunArguments,
    private readonly configuration: IBuildConfiguration,
  ) {}

  /**
   * Spawns one command.
   *
   * @returns The child process, and a promise that settles when it exits - rejecting on a non-zero
   * exit code.
   */
  runCommand(
    command: string,
    options: { env: { [key: string]: string }; sourcePath: string },
  ): [ChildProcessWithoutNullStreams, Promise<void>] {
    const spawnProcessOptions = { cwd: options.sourcePath, env: options.env, shell: true };
    const runner = ProcessUtility.runDetachedProcess(command, spawnProcessOptions, 'pipe');

    const promiseToFinishCommand = new Promise<void>((resolve, reject) => {
      runner.stderr.on('error', (error) => {
        runner.kill();
        reject(error);
      });
      runner.on('close', (exitCode) => {
        runner.removeAllListeners();

        if (exitCode === 0) {
          resolve();
        } else {
          const error = new Error('Command returned non-zero exit code!');
          error['data'] = {
            command,
            exitCode,
          };
          reject(error);
        }
      });
    });

    return [runner, promiseToFinishCommand];
  }

  /**
   * Starts every job, each waiting on the jobs it depends on, and no more than `concurrency` at once.
   */
  scheduleJobs(): Promise<void>[] {
    const streamManager = new StreamManager();
    const timestamp = Date.now();

    // Ensure logsDir exists, and is writable.
    const logsPathPrefix = this.args.logsDir ? resolve(join(this.args.logsDir, `${timestamp}`)) : undefined;
    if (logsPathPrefix) {
      mkdirSync(logsPathPrefix, '0744');
    }

    const env = this.configuration.env;
    const jobList = Object.keys(this.configuration.jobs);
    const jobPromises: { [key: string]: Promise<void> } = {};
    const limit = pLimit(this.args.concurrency);

    let i = 0;
    let jobsScheduled = 0;
    while (jobsScheduled !== jobList.length && i < jobList.length) {
      for (const jobName of jobList) {
        if (jobName in jobPromises) {
          continue;
        }

        const job = this.configuration.jobs[jobName];

        if (job.dependsOn.every((j) => j in jobPromises)) {
          jobPromises[jobName] = limit(
            () =>
              new Promise(async (resolve, reject) => {
                try {
                  await Promise.all(job.dependsOn.map((j) => jobPromises[j]));
                } catch (error) {
                  reject(error);
                  return;
                }

                for (let i = 0; i <= job.retry; i++) {
                  const timeout =
                    job.timeout > 0
                      ? setTimeout(() => {
                          job.onError === 'throw' ? reject(new Error('Job timed out! ' + jobName)) : resolve();
                        }, job.timeout)
                      : undefined;

                  try {
                    if (!this.args.dryRun) {
                      const [stream, promiseToFinishCommand] = this.runCommand(job.command, {
                        env,
                        sourcePath: this.args.sourcePath,
                      });
                      streamManager.registerStream(jobName, stream, { logsPathPrefix });
                      await promiseToFinishCommand;
                    }

                    resolve();
                    break;
                  } catch (error) {
                    if (i === job.retry) {
                      job.onError === 'throw' ? reject(error) : resolve();
                    }
                  } finally {
                    if (timeout) {
                      clearTimeout(timeout);
                    }
                  }
                }
              }),
          );

          jobsScheduled += 1;
        }
      }

      i += 1;
    }

    if (jobsScheduled !== jobList.length) {
      throw new Error('Unable to schedule all jobs. Possible circular dependency!');
    }

    return Object.values(jobPromises);
  }

  /**
   * Runs the whole build, rejecting on the first job that fails or when the timeout elapses.
   */
  start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout =
        this.args.timeout > 0
          ? setTimeout(() => {
              reject(new Error(`Reached timeout of ${this.args.timeout} ms!`));
            }, this.args.timeout)
          : undefined;

      try {
        const jobPromises = this.scheduleJobs();
        await Promise.all(jobPromises);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    });
  }
}
