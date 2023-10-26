import { ChildProcessWithoutNullStreams } from 'child_process';
import pLimit from 'p-limit';
import { join, resolve } from 'path';
import { IBuildConfiguration } from './models/build-configuration.interface.js';
import { IRunArguments } from './models/run-arguments.interface.js';
import { StreamManager } from './streams/stream-manager.js';
import { ProcessUtility } from './utilities/process/process.utility.js';

export function runCommand(
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

export function scheduleJobs(args: IRunArguments, configuration: IBuildConfiguration): Promise<void>[] {
  const streamManager = new StreamManager();
  const timestamp = Date.now();
  const logsPathPrefix = args.logsDir ? resolve(join(args.logsDir, `${timestamp}`)) : undefined;

  const env = configuration.env;
  const jobList = Object.keys(configuration.jobs);
  const jobPromises: { [key: string]: Promise<void> } = {};
  const limit = pLimit(args.concurrency);

  let i = 0;
  let jobsScheduled = 0;
  while (jobsScheduled !== jobList.length && i < jobList.length) {
    for (const jobName of jobList) {
      if (jobName in jobPromises) {
        continue;
      }

      const job = configuration.jobs[jobName];

      if (job.dependsOn.every((j) => j in jobPromises)) {
        jobPromises[jobName] = limit(
          () =>
            new Promise(async (resolve, reject) => {
              const dependentPromiseResults = await Promise.allSettled(job.dependsOn.map((j) => jobPromises[j]));
              for (const [index, result] of dependentPromiseResults.entries()) {
                if (result.status === 'rejected' && configuration.jobs[job.dependsOn[index]].onError === 'throw') {
                  reject(result.reason);
                  return;
                }
              }

              for (let i = 0; i <= job.retry; i++) {
                const timeout =
                  job.timeout > 0
                    ? setTimeout(() => {
                        job.onError === 'throw' ? reject(new Error('Job timed out! ' + jobName)) : resolve();
                      }, job.timeout)
                    : undefined;

                try {
                  const [stream, promiseToFinishCommand] = runCommand(job.command, {
                    env,
                    sourcePath: args.sourcePath,
                  });
                  streamManager.registerStream(jobName, stream, { logsPathPrefix });
                  await promiseToFinishCommand;
                  resolve();
                } catch (error) {
                  job.onError === 'throw' ? reject(error) : resolve();
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

export function start(args: IRunArguments, configuration: IBuildConfiguration): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const jobPromises = scheduleJobs(args, configuration);

      if (args.dryRun) {
        resolve();
        return;
      }

      if (args.timeout > 0) {
        setTimeout(() => {
          reject(new Error(`Reached timeout of ${args.timeout} ms!`));
        }, args.timeout);
      }

      await Promise.all(jobPromises);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}
