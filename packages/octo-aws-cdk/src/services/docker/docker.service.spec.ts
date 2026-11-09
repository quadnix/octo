import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
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

const CREDENTIALS = { password: 'password', registryUri: 'https://registry:4510', username: 'AWS' };

/**
 * A stand-in for the docker binary that records what a command sees of its credentials: the config
 * directory, its config, what the credential helper on the PATH returns, and its arguments.
 */
async function createCredentialsRecordingBinary(): Promise<{
  binaryPath: string;
  readRecord: () => Promise<{ arguments: string[]; config: any; configDirectory: string; helperOutput: any }>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'octo-docker-'));
  const binaryPath = join(directory, 'docker');
  const recordPath = join(directory, 'record');

  await writeFile(
    binaryPath,
    '#!/bin/sh\n' +
      `echo "$DOCKER_CONFIG" > ${recordPath}\n` +
      `cat "$DOCKER_CONFIG/config.json" >> ${recordPath}; echo >> ${recordPath}\n` +
      `echo https://registry:4510 | docker-credential-octo get >> ${recordPath}; echo >> ${recordPath}\n` +
      `echo "$@" >> ${recordPath}\n` +
      'sleep 0.2\n',
  );
  await chmod(binaryPath, 0o755);

  return {
    binaryPath,
    readRecord: async (): Promise<{ arguments: string[]; config: any; configDirectory: string; helperOutput: any }> => {
      const [configDirectory, config, helperOutput, commandArguments] = (await readFile(recordPath, 'utf8')).split(
        '\n',
      );
      return {
        arguments: commandArguments.split(' '),
        config: JSON.parse(config),
        configDirectory,
        helperOutput: JSON.parse(helperOutput),
      };
    },
  };
}

describe('DockerService UT', () => {
  const originalDockerConfig = process.env.DOCKER_CONFIG;
  let userDockerDirectory: string;

  beforeEach(async () => {
    userDockerDirectory = join(await mkdtemp(join(tmpdir(), 'octo-docker-user-')), '.docker');
    process.env.DOCKER_CONFIG = userDockerDirectory;
  });

  afterEach(() => {
    if (originalDockerConfig === undefined) {
      delete process.env.DOCKER_CONFIG;
    } else {
      process.env.DOCKER_CONFIG = originalDockerConfig;
    }
  });

  describe('build()', () => {
    it('should build a single manifest, so a push writes its tag once', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).build(
        'registry/repository:0.0.1',
        'linux/arm64',
        '/context/Dockerfile',
        '/context',
        { buildArguments: {}, buildSecrets: {} },
        CREDENTIALS,
        () => undefined,
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

    it('should pass build arguments, and each secret by the name of its environment variable', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).build(
        'registry/repository:0.0.1',
        'linux/arm64',
        '/context/Dockerfile',
        '/context',
        { buildArguments: { NODE_ENV: 'production' }, buildSecrets: { NPM_TOKEN: 'CI_NPM_TOKEN' } },
        CREDENTIALS,
        () => undefined,
      );

      const commandArguments = await readArguments();
      expect(commandArguments.slice(0, 5)).toEqual([
        'build',
        '--build-arg',
        'NODE_ENV=production',
        '--secret',
        'id=NPM_TOKEN,env=CI_NPM_TOKEN',
      ]);
    });
  });

  describe('push()', () => {
    it('should throw error if docker exits non-zero, carrying what it printed', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'octo-docker-'));
      const binaryPath = join(directory, 'docker');
      await writeFile(binaryPath, '#!/bin/sh\necho "tag is immutable" >&2\nexit 1\n');
      await chmod(binaryPath, 0o755);

      await expect(
        new DockerService(binaryPath).push('registry/repository:0.0.1', CREDENTIALS, () => undefined),
      ).rejects.toThrow(/docker push" exited with 1!\ntag is immutable/);
    });

    it('should log each line docker prints, with its command and stream, as it prints it', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'octo-docker-'));
      const binaryPath = join(directory, 'docker');
      await writeFile(binaryPath, '#!/bin/sh\nprintf "layer 1\\nlayer 2\\npushed"\nprintf "a warning\\n" >&2\n');
      await chmod(binaryPath, 0o755);
      const lines: [string, { command: string; stream: string }][] = [];

      await new DockerService(binaryPath).push('registry/repository:0.0.1', CREDENTIALS, (line, metadata) =>
        lines.push([line, metadata]),
      );

      expect(lines.filter(([, { stream }]) => stream === 'stdout')).toEqual([
        ['layer 1', { command: 'push', stream: 'stdout' }],
        ['layer 2', { command: 'push', stream: 'stdout' }],
        ['pushed', { command: 'push', stream: 'stdout' }],
      ]);
      expect(lines.filter(([, { stream }]) => stream === 'stderr')).toEqual([
        ['a warning', { command: 'push', stream: 'stderr' }],
      ]);
    });

    it('should hand docker the credentials through a helper, never on the command line', async () => {
      const { binaryPath, readRecord } = await createCredentialsRecordingBinary();

      await new DockerService(binaryPath).push('registry:4510/repository:0.0.1', CREDENTIALS, () => undefined);

      const record = await readRecord();
      expect(record.config).toEqual({ credHelpers: { 'registry:4510': 'octo' } });
      expect(record.helperOutput).toEqual({ Secret: 'password', ServerURL: 'https://registry:4510', Username: 'AWS' });
      expect(record.arguments).toEqual(['push', 'registry:4510/repository:0.0.1']);
    });

    it('should keep the user docker config and link the rest of their docker directory', async () => {
      await mkdir(join(userDockerDirectory, 'contexts', 'meta'), { recursive: true });
      await writeFile(join(userDockerDirectory, 'contexts', 'meta', 'context'), 'desktop-linux');
      const userConfig = {
        credHelpers: { 'other-registry': 'ecr-login' },
        credsStore: 'osxkeychain',
        currentContext: 'desktop-linux',
      };
      await writeFile(join(userDockerDirectory, 'config.json'), JSON.stringify(userConfig));
      const { binaryPath, readRecord } = await createCredentialsRecordingBinary();

      await new DockerService(binaryPath).push('registry:4510/repository:0.0.1', CREDENTIALS, () => undefined);

      const record = await readRecord();
      expect(record.config).toEqual({
        credHelpers: { 'other-registry': 'ecr-login', 'registry:4510': 'octo' },
        credsStore: 'osxkeychain',
        currentContext: 'desktop-linux',
      });
      // The user's directory is unchanged, and the private one is gone.
      expect(JSON.parse(await readFile(join(userDockerDirectory, 'config.json'), 'utf8'))).toEqual(userConfig);
      expect(await readFile(join(userDockerDirectory, 'contexts', 'meta', 'context'), 'utf8')).toBe('desktop-linux');
      await expect(readdir(record.configDirectory)).rejects.toThrow(/ENOENT/);
    });

    it('should give each of two parallel pushes to one registry its own credentials', async () => {
      const first = await createCredentialsRecordingBinary();
      const second = await createCredentialsRecordingBinary();

      await Promise.all([
        new DockerService(first.binaryPath).push('registry:4510/one:0.0.1', CREDENTIALS, () => undefined),
        new DockerService(second.binaryPath).push(
          'registry:4510/two:0.0.1',
          { ...CREDENTIALS, password: 'other-password' },
          () => undefined,
        ),
      ]);

      expect((await first.readRecord()).helperOutput.Secret).toBe('password');
      expect((await second.readRecord()).helperOutput.Secret).toBe('other-password');
    });

    it('should push the given image reference', async () => {
      const { binaryPath, readArguments } = await createRecordingBinary();

      await new DockerService(binaryPath).push('registry/repository:0.0.1', CREDENTIALS, () => undefined);

      expect(await readArguments()).toEqual(['push', 'registry/repository:0.0.1']);
    });
  });
});
