import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DockerService } from './docker.service.js';

/**
 * A stand-in for the docker binary that records the arguments it was given, so a test can assert on
 * the command line rather than on a mock of it - the arguments are the whole contract here.
 */
async function createRecordingBinary(): Promise<{ binaryPath: string; readArguments: () => Promise<string[]> }> {
  const directory = await mkdtemp(join(tmpdir(), 'octo-docker-'));
  const binaryPath = join(directory, 'docker');
  const recordPath = join(directory, 'arguments');

  await writeFile(binaryPath, `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > ${recordPath}\ncat > /dev/null\n`);
  await chmod(binaryPath, 0o755);

  return {
    binaryPath,
    readArguments: async (): Promise<string[]> => (await readFile(recordPath, 'utf8')).trim().split('\n'),
  };
}

describe('DockerService UT', () => {
  describe('build()', () => {
    it('should build a single manifest, so a push writes its tag once', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).build(
        'registry/repository:0.0.1',
        'linux/arm64',
        '/context/Dockerfile',
        '/context',
      );

      expect(await readArguments()).toEqual([
        'build',
        '--platform',
        'linux/arm64',
        '--provenance',
        'false',
        '--sbom',
        'false',
        '--file',
        '/context/Dockerfile',
        '--tag',
        'registry/repository:0.0.1',
        '/context',
      ]);
    });
  });

  describe('login()', () => {
    it('should keep the password off the command line', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).login('https://registry', 'AWS', 'password');

      const commandArguments = await readArguments();
      expect(commandArguments).toEqual(['login', '--username', 'AWS', '--password-stdin', 'https://registry']);
      expect(commandArguments).not.toContain('password');
    });
  });

  describe('push()', () => {
    it('should throw error if docker exits non-zero, carrying what it printed', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'octo-docker-'));
      const binaryPath = join(directory, 'docker');
      await writeFile(binaryPath, '#!/bin/sh\necho "tag is immutable" >&2\nexit 1\n');
      await chmod(binaryPath, 0o755);

      await expect(new DockerService(binaryPath).push('registry/repository:0.0.1')).rejects.toThrow(
        /docker push" exited with 1!\ntag is immutable/,
      );
    });

    it('should push the given image reference', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).push('registry/repository:0.0.1');

      expect(await readArguments()).toEqual(['push', 'registry/repository:0.0.1']);
    });
  });
});
