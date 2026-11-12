import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';
import { type ValidateReport, ValidateReportUtility } from './validate-report.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BIN_DIRECTORY = resolve(__dirname, '..', '..', '..', 'node_modules', '.bin');

const OUTPUT_DIRECTORY = join('.octo', 'generated');

const STATE_DIRECTORY = join('.octo', 'state');

/**
 * The parts of a template's `octo.yaml` a test edits.
 */
export interface OctoDefinition {
  imports: { className: string; importPath: string }[];
  modules: { moduleClass: string; moduleId: string; moduleInputs: Record<string, unknown> }[];
  settings: { stateProvider: { statePath: string } };
  terraform: { providers: { accountId: string; providerType: string; regionId: string; spec?: object }[] };
}

/**
 * Drives a template through the `octo` CLI and its `octo.yaml`, the way a user does.
 *
 * The CLI's own bin directory is prepended to `PATH`, because terraform shells back out to
 * `octo run-action` and `octo get-response` by bare name.
 */
export class OctoCliUtility {
  /**
   * Runs the full lifecycle against the given definition: lock, generate, validate, apply, commit.
   * Returns the report validate printed, the one a user reviews before the apply.
   *
   * Apply and commit find the run's lock themselves, as they do for a user. The apply approves every
   * destroy, unless `allowDestroy` names the ones to let through, each as `<folder>/<address>`.
   *
   * A run that reached the apply always ends in a commit, because from there on it may have changed
   * live infrastructure. A failed apply commits with `--partial`, which records what did apply.
   *
   * The lock is released by a `commit` that succeeds, and by an explicit unlock when any other step
   * is what failed - a lock left behind blocks the next run, including the teardown.
   */
  static async lifecycle(
    projectDirectory: string,
    definitionFilePath: string,
    environment: Record<string, string> = {},
    { allowDestroy }: { allowDestroy?: string[] } = {},
  ): Promise<ValidateReport> {
    const run = (args: string[]): Promise<{ stderr: string; stdout: string }> =>
      OctoCliUtility.execute(projectDirectory, definitionFilePath, args, environment);
    const lockId = (await run(['lock'])).stdout.trim();
    const unlock = (): Promise<unknown> => run(['unlock', '--lockId', lockId]).catch(() => undefined);

    // Nothing before the apply reaches infrastructure, so a failure here has nothing to record.
    let report: ValidateReport;
    try {
      await run(['generate', '--outputDir', OUTPUT_DIRECTORY]);
      report = ValidateReportUtility.parse((await run(['validate', '--terragruntDir', OUTPUT_DIRECTORY])).stderr);
    } catch (error) {
      await unlock();
      throw error;
    }

    let applyError: unknown;
    try {
      const approval = allowDestroy
        ? allowDestroy.flatMap((destroy) => ['--allowDestroy', destroy])
        : ['--autoApprove'];
      await run(['apply', '--terragruntDir', OUTPUT_DIRECTORY, ...approval]);
    } catch (error) {
      applyError = error;
    }

    const commitArguments = ['commit', '--terragruntDir', OUTPUT_DIRECTORY];
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
    return report;
  }

  /**
   * The response octo committed for one resource, by its context (`@octo/route-table=rt-…`).
   *
   * @throws If the state holds no such resource.
   */
  static async readCommittedResponse(
    projectDirectory: string,
    resourceContext: string,
  ): Promise<Record<string, string>> {
    const state = await this.readCommittedState(projectDirectory);
    const entry = state.data.resources[resourceContext];
    if (!entry) {
      throw new Error(`State holds no resource "${resourceContext}"!`);
    }
    return entry.resource.response;
  }

  /**
   * The responses octo committed, keyed by the resource name inside the context
   * (`@octo/lambda-function`). Reads the local state a template's definition names. Of two resources
   * with one name, only one is kept; {@link readCommittedResponsesOf} returns them all.
   */
  static async readCommittedResponses(
    projectDirectory: string,
  ): Promise<{ [resourceName: string]: Record<string, string> }> {
    const state = await this.readCommittedState(projectDirectory);

    return Object.fromEntries(
      Object.entries(state.data.resources).map(([context, entry]) => [context.split('=')[0], entry.resource.response]),
    );
  }

  /**
   * The responses octo committed for every resource of one name, such as `@octo/lambda-function`.
   */
  static async readCommittedResponsesOf(
    projectDirectory: string,
    resourceName: string,
  ): Promise<Record<string, string>[]> {
    const state = await this.readCommittedState(projectDirectory);

    return Object.entries(state.data.resources)
      .filter(([context]) => context.split('=')[0] === resourceName)
      .map(([, entry]) => entry.resource.response);
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
   * apply runs for minutes and its progress is the only sign it is alive. `environment` holds values
   * for the definition's `env` keys, each passed as `OCTO_ENV_<key>`.
   *
   * @throws If the command exits non-zero. The error carries everything the command printed.
   */
  static async run(
    projectDirectory: string,
    definitionFilePath: string,
    args: string[],
    environment: Record<string, string> = {},
  ): Promise<string> {
    return (await this.execute(projectDirectory, definitionFilePath, args, environment)).stdout;
  }

  /**
   * Generates and validates the given definition, applying nothing, and returns the report validate
   * printed. Takes no lock, as neither command needs one.
   */
  static async validate(
    projectDirectory: string,
    definitionFilePath: string,
    environment: Record<string, string> = {},
  ): Promise<ValidateReport> {
    await this.execute(
      projectDirectory,
      definitionFilePath,
      ['generate', '--outputDir', OUTPUT_DIRECTORY],
      environment,
    );
    const { stderr } = await this.execute(
      projectDirectory,
      definitionFilePath,
      ['validate', '--terragruntDir', OUTPUT_DIRECTORY],
      environment,
    );
    return ValidateReportUtility.parse(stderr);
  }

  /**
   * Writes a definition of the template's own, derived from `baseFileName` by the given edit, and
   * returns its path.
   *
   * Each is written under `.octo/`, its state path rewritten to name the same state as its base.
   * An edit may point it at a state of its own.
   */
  static async writeDefinition(
    projectDirectory: string,
    name: string,
    edit: (definition: OctoDefinition) => void = (): void => undefined,
    baseFileName = 'octo.yaml',
  ): Promise<string> {
    const baseFilePath = join(projectDirectory, baseFileName);
    const definition = load(await readFile(baseFilePath, 'utf8')) as OctoDefinition;
    const definitionDirectory = join(projectDirectory, '.octo');

    const statePath = resolve(dirname(baseFilePath), definition.settings.stateProvider.statePath);
    definition.settings.stateProvider.statePath = relative(definitionDirectory, statePath);
    edit(definition);

    const definitionFilePath = join(definitionDirectory, `${name}.yaml`);
    await mkdir(definitionDirectory, { recursive: true });
    await writeFile(definitionFilePath, dump(definition));

    return definitionFilePath;
  }

  /**
   * Runs one `octo` command and returns what it printed. See {@link run}.
   */
  private static execute(
    projectDirectory: string,
    definitionFilePath: string,
    args: string[],
    environment: Record<string, string>,
  ): Promise<{ stderr: string; stdout: string }> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(join(BIN_DIRECTORY, 'octo'), args, {
        cwd: projectDirectory,
        env: {
          ...process.env,
          ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [`OCTO_ENV_${key}`, value])),
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
          resolvePromise({ stderr, stdout });
        } else {
          reject(new Error(`"octo ${args[0]}" exited with ${exitCode}!\n${stdout}\n${stderr}`));
        }
      });
    });
  }

  /**
   * The resources octo committed, from the local state a template's definition names.
   */
  private static async readCommittedState(projectDirectory: string): Promise<{
    data: { resources: { [context: string]: { resource: { response: Record<string, string> } } } };
  }> {
    return JSON.parse(await readFile(join(projectDirectory, STATE_DIRECTORY, 'resources-actual.json'), 'utf8'));
  }
}
