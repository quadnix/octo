import { ProcessUtility } from './process.utility.js';

describe('ProcessUtility Test', () => {
  describe('runDetachedProcess()', () => {
    it('should run process and return stream with error', (done) => {
      const options = { env: {}, shell: true };
      const stream = ProcessUtility.runDetachedProcess('bad_program', options, 'pipe');

      stream.on('close', (exitCode) => {
        if (exitCode === 0) {
          done(new Error('Zero exit code!'));
        } else {
          done();
        }
      });
    });

    it('should run process and return stream with success', (done) => {
      const options = { env: {}, shell: true };
      const stream = ProcessUtility.runDetachedProcess('echo test', options, 'pipe');

      stream.stdout.on('data', (data) => {
        expect(data.toString()).toBe('test\n');
      });
      stream.on('close', (exitCode) => {
        if (exitCode === 0) {
          done();
        } else {
          done(new Error('Non-Zero exit code!'));
        }
      });
    });

    it('should set environment', (done) => {
      const options = { env: { CUSTOM_ENV: 'test-env' }, shell: true };
      const stream = ProcessUtility.runDetachedProcess('echo $CUSTOM_ENV', options, 'pipe');

      stream.stdout.on('data', (data) => {
        expect(data.toString()).toBe('test-env\n');
      });
      stream.on('close', (exitCode) => {
        if (exitCode === 0) {
          done();
        } else {
          done(new Error('Non-Zero exit code!'));
        }
      });
    });
  });
});
