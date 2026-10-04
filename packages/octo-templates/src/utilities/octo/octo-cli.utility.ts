import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BIN_DIRECTORY = resolve(__dirname, '..', '..', '..', 'node_modules', '.bin');

const OUTPUT_DIRECTORY = join('.octo', 'generated');

const STATE_DIRECTORY = join('.octo', 'state');

/**
 * The parts of a template's `octo.yaml` a test edits.
 */
export interface OctoDefinition {
  modules: { moduleClass: string; moduleId: string; moduleInputs: Record<string, unknown> }[];
  settings: { stateProvider: { statePath: string } };
}

/**
 * Drives a template through the `octo` CLI, the way a user does.
 *
 * A template whose resources are all managed by terraform can be driven in-process through
 * `TestModuleContainer`. One holding an external resource cannot: terraform shells back out to
 * `octo run-action` mid-apply, and that is a second process, which finds the modules through the
 * definition file and the prior state through the state provider the definition names. Only a real
 * CLI run puts both of those where the callback will look.
 *
 * The CLI's own bin directory is prepended to `PATH` for the same reason - the callback invokes
 * `octo` by bare name.
 */
export class OctoCliUtility {
  /**
   * Runs the full lifecycle against the given definition: lock, generate, validate, apply, commit.
   *
   * A run that reached the apply always ends in a commit, because from there on it may have changed
   * live infrastructure, and octo's record of it would otherwise say nothing happened. A failed
   * apply commits with `--partial`, which is not a better commit: it drops the check that every
   * declared output came back, and that is only safe here because a failed apply is already known to
   * be incomplete. Defaulting to it would turn a successful apply that quietly produced nothing into
   * a warning nobody reads.
   *
   * The lock is released by a `commit` that succeeds, and by an explicit unlock when any other step
   * is what failed - a lock left behind blocks the next run, including the teardown.
   */
  static async lifecycle(
    projectDirectory: string,
    definitionFilePath: string,
    environment: Record<string, string> = {},
  ): Promise<void> {
    const run = (args: string[]): Promise<string> =>
      OctoCliUtility.run(projectDirectory, definitionFilePath, args, environment);
    const lockId = (await run(['lock'])).trim();
    const unlock = (): Promise<unknown> => run(['unlock', '--lockId', lockId]).catch(() => undefined);

    // Nothing before the apply reaches infrastructure, so a failure here has nothing to record.
    try {
      await run(['generate', '--outputDir', OUTPUT_DIRECTORY]);
      await run(['validate', '--terragruntDir', OUTPUT_DIRECTORY]);
    } catch (error) {
      await unlock();
      throw error;
    }

    let applyError: unknown;
    try {
      await run(['apply', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId, '--auto-approve']);
    } catch (error) {
      applyError = error;
    }

    const commitArguments = ['commit', '--terragruntDir', OUTPUT_DIRECTORY, '--lockId', lockId];
    try {
      await run(applyError ? [...commitArguments, '--partial'] : commitArguments);
    } catch (error) {
      // Release the lock a failed commit keeps.
      await unlock();
      throw applyError ?? error;
    }

    if (applyError) {
      throw applyError;
    }
  }

  /**
   * The responses octo committed, keyed by the resource name inside the context
   * (`@octo/lambda-function`). Reads the local state a template's definition names.
   */
  static async readCommittedResponses(
    projectDirectory: string,
  ): Promise<{ [resourceName: string]: Record<string, string> }> {
    const state = JSON.parse(
      await readFile(join(projectDirectory, STATE_DIRECTORY, 'resources-actual.json'), 'utf8'),
    ) as {
      data: { resources: { [context: string]: { resource: { response: Record<string, string> } } } };
    };

    return Object.fromEntries(
      Object.entries(state.data.resources).map(([context, entry]) => [context.split('=')[0], entry.resource.response]),
    );
  }

  /**
   * The names of the per-resource records left in the state directory, sorted. A record is written
   * for an external resource while octo acts on it, so an empty list means nothing is in flight.
   */
  static async readStateRecordNames(projectDirectory: string): Promise<string[]> {
    const names = await readdir(join(projectDirectory, STATE_DIRECTORY));
    return names.filter((name) => name.startsWith('resource-state-')).sort();
  }

  /**
   * Runs one `octo` command, returning its stdout. Its stderr is forwarded as it arrives, because an
   * apply runs for minutes and its progress is the only sign it is alive.
   *
   * @throws If the command exits non-zero. The error carries everything the command printed.
   */
  static run(
    projectDirectory: string,
    definitionFilePath: string,
    args: string[],
    environment: Record<string, string> = {},
  ): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(join(BIN_DIRECTORY, 'octo'), args, {
        cwd: projectDirectory,
        env: {
          ...process.env,
          ...environment,
          OCTO_DEFINITION_FILE_PATH: definitionFilePath,
          PATH: [BIN_DIRECTORY, process.env.PATH ?? ''].join(delimiter),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        process.stderr.write(chunk);
      });

      child.on('error', (error) => reject(new Error(`Could not run "octo ${args[0]}"! ${error.message}`)));
      child.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolvePromise(stdout);
        } else {
          reject(new Error(`"octo ${args[0]}" exited with ${exitCode}!\n${stdout}\n${stderr}`));
        }
      });
    });
  }

  /**
   * Writes a definition of the template's own, derived from `baseFileName` by the given edit, and
   * returns its path.
   *
   * Each is written beside the state directory, keeping the same definition directory, which is what
   * anchors the state path every run has to reuse.
   */
  static async writeDefinition(
    projectDirectory: string,
    name: string,
    edit: (definition: OctoDefinition) => void = (): void => undefined,
    baseFileName = 'octo.yaml',
  ): Promise<string> {
    const definition = load(await readFile(join(projectDirectory, baseFileName), 'utf8')) as OctoDefinition;

    edit(definition);
    definition.settings.stateProvider.statePath = 'state';

    const definitionFilePath = join(projectDirectory, '.octo', `${name}.yaml`);
    await mkdir(join(projectDirectory, '.octo'), { recursive: true });
    await writeFile(definitionFilePath, dump(definition));

    return definitionFilePath;
  }
}
