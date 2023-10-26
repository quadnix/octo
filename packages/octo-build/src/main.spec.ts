import { jest } from '@jest/globals';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { resolve } from 'path';
import { Main } from './main.js';
import { IBuildConfiguration, IJob } from './models/build-configuration.interface.js';
import { IRunArguments } from './models/run-arguments.interface.js';
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

    const job1: IJob = {
      command: 'echo 1',
      dependsOn: [],
      onError: 'throw',
      retry: 0,
      timeout: 0,
    };
    const job2: IJob = {
      command: 'echo 2',
      dependsOn: [],
      onError: 'throw',
      retry: 0,
      timeout: 0,
    };
    const job3: IJob = {
      command: 'echo 3',
      dependsOn: [],
      onError: 'throw',
      retry: 0,
      timeout: 0,
    };

    let mockRegisterStream: jest.Mock;
    let mockRunCommand: jest.Mock;

    beforeEach(() => {
      mockRegisterStream = jest.spyOn(StreamManager.prototype, 'registerStream') as jest.Mock;
      mockRegisterStream.mockImplementation(() => {
        /* do nothing */
      });

      mockRunCommand = jest.spyOn(Main.prototype, 'runCommand') as jest.Mock;
    });

    afterEach(() => {
      jest.resetAllMocks();
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
  });
});
