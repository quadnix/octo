import type { ChildProcessWithoutNullStreams } from 'child_process';
import { resolve } from 'path';
import { jest } from '@jest/globals';
import { Main } from './main.js';
import type { IBuildConfiguration, IJob } from './models/build-configuration.interface.js';
import type { IRunArguments } from './models/run-arguments.interface.js';
import { StreamManager } from './streams/stream-manager.js';

jest.mock('./main.js');
jest.mock('./streams/stream-manager.js');

describe('Main Test', () => {
  describe('runCommand()', () => {
    const args: IRunArguments = {
      buildFilePath: '',
      concurrency: 2,
      dryRun: false,
      sourcePath: '.',
      timeout: 1000,
    };
    const configuration: IBuildConfiguration = {
      dist: '',
      env: {},
      jobs: {},
    };

    let service: Main;

    beforeEach(() => {
      service = new Main(args, configuration);
    });

    it('should run command with error', async () => {
      const [stream, promiseToFinishCommand] = service.runCommand('bad_program', { env: {}, sourcePath: resolve('.') });

      stream.on('exit', (exitCode) => {
        expect(exitCode).toBeGreaterThan(0);
      });

      await expect(async () => {
        await promiseToFinishCommand;
      }).rejects.toMatchInlineSnapshot(`[Error: Command returned non-zero exit code!]`);
    });

    it('should run command with success', async () => {
      const [stream, promiseToFinishCommand] = service.runCommand('echo test', { env: {}, sourcePath: resolve('.') });

      stream.on('exit', (exitCode) => {
        expect(exitCode).toBe(0);
      });

      await promiseToFinishCommand;
    });
  });

  describe('scheduleJobs()', () => {
    const args: IRunArguments = {
      buildFilePath: '',
      concurrency: 2,
      dryRun: false,
      sourcePath: '.',
      timeout: 1000,
    };

    let job1: IJob;
    let job2: IJob;
    let job3: IJob;
    let mockRegisterStream: jest.Mock;
    let mockRunCommand: jest.Mock;

    beforeEach(() => {
      job1 = {
        command: 'echo 1',
        dependsOn: [],
        onError: 'throw',
        retry: 0,
        timeout: 0,
      };
      job2 = {
        command: 'echo 2',
        dependsOn: [],
        onError: 'throw',
        retry: 0,
        timeout: 0,
      };
      job3 = {
        command: 'echo 3',
        dependsOn: [],
        onError: 'throw',
        retry: 0,
        timeout: 0,
      };

      mockRegisterStream = jest.spyOn(StreamManager.prototype, 'registerStream') as jest.Mock;
      mockRegisterStream.mockImplementation(() => {
        /* do nothing */
      });

      mockRunCommand = jest.spyOn(Main.prototype, 'runCommand') as jest.Mock;
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should throw error when unable to schedule all jobs', () => {
      job1.dependsOn.push('job2');

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValue([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      expect(() => {
        service.scheduleJobs();
      }).toThrowErrorMatchingInlineSnapshot(`"Unable to schedule all jobs. Possible circular dependency!"`);
    });

    it('should be able to schedule a single job', async () => {
      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValue([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(1);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
    });

    it('should be able to schedule multiple distinct jobs', async () => {
      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
          job2,
        },
      };

      mockRunCommand.mockReturnValue([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(2);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
      expect(mockRegisterStream.mock.calls[1][0]).toBe('job2');
    });

    it('should schedule dependent job later', async () => {
      job2.dependsOn.push('job3');
      job1.dependsOn.push('job2');

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
          job2,
          job3,
        },
      };

      mockRunCommand.mockReturnValue([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(3);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job3');
      expect(mockRegisterStream.mock.calls[1][0]).toBe('job2');
      expect(mockRegisterStream.mock.calls[2][0]).toBe('job1');
    });

    it('should throw when a job fails', async () => {
      job2.dependsOn.push('job3');
      job1.dependsOn.push('job2');

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
          job2,
          job3,
        },
      };

      mockRunCommand.mockReturnValue([
        null as unknown as ChildProcessWithoutNullStreams,
        Promise.reject(new Error('error!')),
      ]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await expect(async () => {
        await Promise.all(promises);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"error!"`);
    });

    it('should throw when a job times out while running single job', async () => {
      job1.timeout = 10;

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValue([
        null as unknown as ChildProcessWithoutNullStreams,
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await expect(async () => {
        await Promise.all(promises);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Job timed out! job1"`);
    });

    it('should throw when a job times out while running multiple jobs', async () => {
      job2.timeout = 10;
      job2.dependsOn.push('job3');
      job1.dependsOn.push('job2');

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
          job2,
          job3,
        },
      };

      mockRunCommand.mockReturnValueOnce([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);
      mockRunCommand.mockReturnValueOnce([
        null as unknown as ChildProcessWithoutNullStreams,
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
      mockRunCommand.mockReturnValueOnce([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await expect(async () => {
        await Promise.all(promises);
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Job timed out! job2"`);
    });

    it('should not retry when a job succeeds', async () => {
      job1.retry = 1;

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValue([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(1);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
    });

    it('should retry when a job fails', async () => {
      job1.retry = 1;

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValueOnce([
        null as unknown as ChildProcessWithoutNullStreams,
        Promise.reject(new Error('error!')),
      ]);
      mockRunCommand.mockReturnValueOnce([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(2);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
    });

    it('should ignore the error while running single job', async () => {
      job1.onError = 'ignore';

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
        },
      };

      mockRunCommand.mockReturnValueOnce([
        null as unknown as ChildProcessWithoutNullStreams,
        Promise.reject(new Error('error!')),
      ]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(1);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
    });

    it('should ignore the error while running multiple jobs', async () => {
      job2.onError = 'ignore';
      job2.dependsOn.push('job3');
      job1.dependsOn.push('job2');

      const configuration: IBuildConfiguration = {
        dist: '',
        env: {},
        jobs: {
          job1,
          job2,
          job3,
        },
      };

      // Pass job3 and job1, but fail job2.
      mockRunCommand.mockReturnValueOnce([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);
      mockRunCommand.mockReturnValueOnce([
        null as unknown as ChildProcessWithoutNullStreams,
        Promise.reject(new Error('error!')),
      ]);
      mockRunCommand.mockReturnValueOnce([null as unknown as ChildProcessWithoutNullStreams, Promise.resolve()]);

      const service = new Main(args, configuration);
      const promises = service.scheduleJobs();
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(3);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job3');
      expect(mockRegisterStream.mock.calls[1][0]).toBe('job2');
      expect(mockRegisterStream.mock.calls[2][0]).toBe('job1');
    });
  });
});
