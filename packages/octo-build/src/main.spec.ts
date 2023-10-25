import { jest } from '@jest/globals';
import { resolve } from 'path';
import { runCommand, scheduleJobs } from './main.js';
import { IBuildConfiguration } from './models/build-configuration.interface.js';
import { IRunArguments } from './models/run-arguments.interface.js';
import { StreamManager } from './streams/stream-manager.js';

jest.mock('./streams/stream-manager.js');

describe('Main Test', () => {
  describe('runCommand()', () => {
    it('should run command with error', async () => {
      const [stream, promiseToFinishCommand] = runCommand('bad_program', { env: {}, sourcePath: resolve('.') });

      stream.on('exit', (exitCode) => {
        expect(exitCode).toBeGreaterThan(0);
      });

      await expect(async () => {
        await promiseToFinishCommand;
      }).rejects.toMatchInlineSnapshot(`[Error: Command returned non-zero exit code!]`);
    });

    it('should run command with success', async () => {
      const [stream, promiseToFinishCommand] = runCommand('echo test', { env: {}, sourcePath: resolve('.') });

      stream.on('exit', (exitCode) => {
        expect(exitCode).toBe(0);
      });

      await promiseToFinishCommand;
    });
  });

  describe('scheduleJobs()', () => {
    let mockRegisterStream: jest.Mock;

    beforeEach(() => {
      mockRegisterStream = jest.spyOn(StreamManager.prototype, 'registerStream') as jest.Mock;
      mockRegisterStream.mockImplementation(() => {
        /* do nothing */
      });
    });

    it('should be able to schedule a single job', async () => {
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
        jobs: {
          job1: {
            command: 'echo 1',
            dependsOn: [],
            onError: 'throw',
            retry: 0,
            timeout: 0,
          },
        },
      };

      const promises = scheduleJobs(args, configuration);
      await Promise.all(promises);

      expect(mockRegisterStream).toHaveBeenCalledTimes(1);
      expect(mockRegisterStream.mock.calls[0][0]).toBe('job1');
    });
  });
});
