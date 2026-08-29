import { spawn } from 'node:child_process';
import { Factory } from '@quadnix/octo';

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
   * Builds `imageReference` from the given build context, as a single manifest.
   *
   * Provenance and SBOM attestations are off because they turn the result into an image index, and
   * pushing an index writes its tag twice - once for the manifest and once for the index. A
   * repository with immutable tags rejects the second write, having already been given the first,
   * which leaves the tag pointing at half a push. Both flags need a buildx-backed `docker build`.
   *
   * @param dockerfilePath Absolute path of the Dockerfile.
   * @param contextDirectory Absolute path of the build context.
   */
  async build(imageReference: string, dockerfilePath: string, contextDirectory: string): Promise<void> {
    await this.run([
      'build',
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
   * appears in the process list or in terraform's echo of the `local-exec` command.
   */
  async login(registryUri: string, username: string, password: string): Promise<void> {
    await this.run(['login', '--username', username, '--password-stdin', registryUri], password);
  }

  /**
   * Pushes an already built image reference to its registry.
   */
  async push(imageReference: string): Promise<void> {
    await this.run(['push', imageReference]);
  }

  /**
   * @throws If docker is not on the PATH, or exits non-zero. The error carries docker's own stderr,
   * which is the only thing that explains a failed build.
   */
  private run(args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.dockerBinary, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

      child.on('error', (error) => {
        reject(new Error(`Could not run "${this.dockerBinary} ${args[0]}"! ${error.message}`));
      });
      child.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`"${this.dockerBinary} ${args[0]}" exited with ${exitCode}!\n${stderr || stdout}`));
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
