import { spawn } from 'node:child_process';
import { Factory } from '@quadnix/octo';

/**
 * How much of docker's stderr is kept for the error a failure throws. Every line it prints goes to
 * the caller's log as it is printed.
 */
const STDERR_TAIL_LENGTH = 64 * 1024;

/**
 * Receives each line docker prints, with the docker command and the stream it came from. A resource
 * action passes its own `log()`.
 */
type DockerLog = (line: string, metadata: { command: string; stream: 'stderr' | 'stdout' }) => void;

/**
 * Runs the local docker CLI on behalf of a resource action.
 *
 * Terraform has no way to build or push a container image, so the resource that publishes one is an
 * external resource and reaches docker through here. Every method shells out to the binary named by
 * `dockerBinary`; nothing is talked to over the docker socket directly.
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
   * @param log Receives each line docker prints.
   */
  async build(
    imageReference: string,
    platform: 'linux/amd64' | 'linux/arm64',
    dockerfilePath: string,
    contextDirectory: string,
    options: { buildArguments: Record<string, string>; buildSecrets: Record<string, string> },
    log: DockerLog,
  ): Promise<void> {
    await this.run(log, [
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
   * Authenticates the docker CLI against a registry.
   *
   * The password is written to the child's stdin rather than passed as an argument, so it never
   * appears in the process list, in terraform's echo of the `local-exec` command, or in `log`.
   */
  async login(registryUri: string, username: string, password: string, log: DockerLog): Promise<void> {
    await this.run(log, ['login', '--username', username, '--password-stdin', registryUri], password);
  }

  /**
   * Pushes an already built image reference to its registry.
   */
  async push(imageReference: string, log: DockerLog): Promise<void> {
    await this.run(log, ['push', imageReference]);
  }

  /**
   * Runs docker, handing each line it prints to `log` as it is printed, and keeping only the last
   * {@link STDERR_TAIL_LENGTH} characters of its stderr.
   *
   * @throws If docker is not on the PATH, or exits non-zero. The error carries the end of docker's own
   * stderr, which is the only thing that explains a failed build.
   */
  private run(log: DockerLog, args: string[], stdin?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.dockerBinary, args, { stdio: ['pipe', 'pipe', 'pipe'] });

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

      if (stdin !== undefined) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
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
