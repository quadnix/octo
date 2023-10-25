import { resolve } from 'path';
import { runCommand } from './main.js';

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
});
