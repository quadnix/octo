import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Factory } from '@quadnix/octo';

/**
 * How much of docker's stderr is kept for the error a failure throws. Every line it prints goes to
 * the caller's log as it is printed.
 */
const STDERR_TAIL_LENGTH = 64 * 1024;

/**
 * The credential helper docker asks for the registry's credentials, found on the PATH as
 * `docker-credential-<name>`.
 */
const CREDENTIAL_HELPER_NAME = 'octo';

/**
 * Receives each line docker prints, with the docker command and the stream it came from. A resource
 * action passes its own `log()`.
 */
type DockerLog = (line: string, metadata: { command: string; stream: 'stderr' | 'stdout' }) => void;

/**
 * What a docker command authenticates to its registry with.
 */
type RegistryCredentials = { password: string; registryUri: string; username: string };

/**
 * Runs the local docker CLI on behalf of a resource action.
 *
 * Terraform has no way to build or push a container image, so the resource that publishes one is an
 * external resource and reaches docker through here. Every method shells out to the binary named by
 * `dockerBinary`; nothing is talked to over the docker socket directly.
 *
 * No command logs in. Each one runs against a private copy of the user's docker config, which sends
 * only the registry's host to a credential helper returning the caller's own token. Parallel
 * commands to one registry so never write the user's credential store, nor read another's token.
 *
 * @internal
 */
export class DockerService {
  /**
   * @internal
   */
  constructor(private readonly dockerBinary: string) {}

  /**
   * Builds `imageReference` for a docker `platform` from the given build context, as a single manifest.
   *
   * Provenance and SBOM attestations are off because they turn the result into an image index, and
   * pushing an index writes its tag twice - once for the manifest and once for the index. A
   * repository with immutable tags rejects the second write, having already been given the first,
   * which leaves the tag pointing at half a push. Both flags need a buildx-backed `docker build`.
   *
   * @param imageReference The `<repository>:<tag>` the built image is tagged as.
   * @param platform The platform the image is built for.
   * @param dockerfilePath Absolute path of the Dockerfile.
   * @param contextDirectory Absolute path of the build context.
   * @param options What the build is given besides its context.
   * @param options.buildArguments Values passed as `--build-arg`.
   * @param options.buildSecrets Secret ids, each mapped to the environment variable docker reads it from.
   * @param credentials The registry the image is tagged for, which a base image may also come from.
   * @param log Receives each line docker prints.
   */
  async build(
    imageReference: string,
    platform: 'linux/amd64' | 'linux/arm64',
    dockerfilePath: string,
    contextDirectory: string,
    options: { buildArguments: Record<string, string>; buildSecrets: Record<string, string> },
    credentials: RegistryCredentials,
    log: DockerLog,
  ): Promise<void> {
    await this.run(log, credentials, [
      'build',
      ...Object.entries(options.buildArguments).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]),
      ...Object.entries(options.buildSecrets).flatMap(([id, variable]) => ['--secret', `id=${id},env=${variable}`]),
      '--platform',
      platform,
      '--provenance',
      'false',
      '--sbom',
      'false',
      '--file',
      dockerfilePath,
      '--tag',
      imageReference,
      contextDirectory,
    ]);
  }

  /**
   * Pushes an already built image reference to its registry.
   */
  async push(imageReference: string, credentials: RegistryCredentials, log: DockerLog): Promise<void> {
    await this.run(log, credentials, ['push', imageReference]);
  }

  /**
   * Runs docker against a config directory holding `credentials`, removed once docker exits.
   */
  private async run(log: DockerLog, credentials: RegistryCredentials, args: string[]): Promise<void> {
    const configDirectory = await mkdtemp(join(tmpdir(), 'octo-docker-config-'));
    try {
      await this.writeConfigDirectory(configDirectory, credentials);
      await this.spawn(log, args, {
        ...process.env,
        DOCKER_CONFIG: configDirectory,
        PATH: [join(configDirectory, 'octo-bin'), process.env.PATH].filter(Boolean).join(delimiter),
      });
    } finally {
      await rm(configDirectory, { force: true, recursive: true });
    }
  }

  /**
   * Runs docker, handing each line it prints to `log` as it is printed, and keeping only the last
   * {@link STDERR_TAIL_LENGTH} characters of its stderr.
   *
   * @throws If docker is not on the PATH, or exits non-zero. The error carries the end of docker's own
   * stderr, which is the only thing that explains a failed build.
   */
  private spawn(log: DockerLog, args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.dockerBinary, args, { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });

      // Log each whole line, holding back the end of a chunk until the line it starts is whole.
      const partialLines = { stderr: '', stdout: '' };
      let stderrTail = '';
      for (const stream of ['stdout', 'stderr'] as const) {
        child[stream].setEncoding('utf8');
        child[stream].on('data', (chunk: string) => {
          if (stream === 'stderr') {
            stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LENGTH);
          }
          const lines = (partialLines[stream] + chunk).split('\n');
          partialLines[stream] = lines.pop()!;
          for (const line of lines) {
            log(line, { command: args[0], stream });
          }
        });
      }

      child.on('error', (error) => {
        reject(new Error(`Could not run "${this.dockerBinary} ${args[0]}"! ${error.message}`));
      });
      child.on('close', (exitCode) => {
        // Log what is left of each stream, which ended without a newline.
        for (const stream of ['stdout', 'stderr'] as const) {
          if (partialLines[stream]) {
            log(partialLines[stream], { command: args[0], stream });
          }
        }

        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(`"${this.dockerBinary} ${args[0]}" exited with ${exitCode}!\n${stderrTail}`));
        }
      });

      child.stdin.end();
    });
  }

  /**
   * Fills `configDirectory` as a docker config directory mirroring the user's, whose `credHelpers`
   * send the registry's host to a helper returning `credentials`.
   *
   * The user's `config.json` is copied, so their credential store still serves every other registry,
   * and every other entry of their docker directory - contexts, CLI plugins, buildx - is linked. The
   * token is kept in a file only the user can read, never on a command line.
   */
  private async writeConfigDirectory(configDirectory: string, credentials: RegistryCredentials): Promise<void> {
    const userDirectory = process.env.DOCKER_CONFIG || join(homedir(), '.docker');

    // Copy the user's config, sending the registry's host to the helper.
    const config = await readFile(join(userDirectory, 'config.json'), 'utf8').then(
      (content) => JSON.parse(content),
      (error) => {
        if (error.code === 'ENOENT') {
          return {};
        }
        throw error;
      },
    );
    config.credHelpers = { ...config.credHelpers, [new URL(credentials.registryUri).host]: CREDENTIAL_HELPER_NAME };
    await writeFile(join(configDirectory, 'config.json'), JSON.stringify(config));

    // Link everything else of the user's docker directory.
    const entries = await readdir(userDirectory).catch((error) => {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
    for (const entry of entries.filter((name) => name !== 'config.json')) {
      await symlink(join(userDirectory, entry), join(configDirectory, entry));
    }

    // Write the credentials, and the helper that reads them back to docker.
    await writeFile(
      join(configDirectory, 'octo-credentials.json'),
      JSON.stringify({
        Secret: credentials.password,
        ServerURL: credentials.registryUri,
        Username: credentials.username,
      }),
      { mode: 0o600 },
    );
    const helperPath = join(configDirectory, 'octo-bin', `docker-credential-${CREDENTIAL_HELPER_NAME}`);
    await mkdir(join(configDirectory, 'octo-bin'));
    await writeFile(
      helperPath,
      '#!/bin/sh\ncat > /dev/null\nif [ "$1" = get ]; then cat "$(dirname "$0")/../octo-credentials.json"; fi\n',
    );
    await chmod(helperPath, 0o700);
  }
}

/**
 * @internal
 */
@Factory<DockerService>(DockerService)
export class DockerServiceFactory {
  private static instance: DockerService;

  /**
   * @param dockerBinary The docker CLI to invoke. Defaults to `docker` on the PATH.
   */
  static async create(dockerBinary: string = 'docker'): Promise<DockerService> {
    if (!this.instance) {
      this.instance = new DockerService(dockerBinary);
    }
    return this.instance;
  }
}
