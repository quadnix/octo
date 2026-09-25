import { existsSync } from 'fs';
import { delimiter, dirname, resolve } from 'path';
import { type App, Container, Octo, StateManagementService } from '@quadnix/octo';
import chalk from 'chalk';
import { YamlDefinitionUtility } from '../definition/yaml/yaml-definition.utility.js';

/**
 * The absolute path of the definition file, from `OCTO_DEFINITION_FILE_PATH`.
 *
 * @throws If the variable is unset, or names a file that does not exist.
 */
function resolveDefinitionFilePath(): string {
  const fromEnv = process.env.OCTO_DEFINITION_FILE_PATH;
  if (!fromEnv) {
    throw new Error(
      `Environment variable "OCTO_DEFINITION_FILE_PATH" is not set! Set it to the path of your Octo definition YAML file.`,
    );
  }

  const definitionFilePath = resolve(process.cwd(), fromEnv);
  if (!existsSync(definitionFilePath)) {
    throw new Error(`Octo definition file not found at "${definitionFilePath}"!`);
  }

  return definitionFilePath;
}

/**
 * Boots only the state provider the definition names, without loading a single module, and returns
 * how often terraform state is checked into it during a terraform command.
 *
 * `apply` is a terraform action rather than an octo mode, so it has no reason to compose a model
 * graph - but terraform state is checked out of the state provider and back into it around every
 * terraform command, so the provider still has to be there.
 */
export async function bootStateProvider(): Promise<{ stateCheckInIntervalInMs: number | undefined }> {
  const definition = new YamlDefinitionUtility(resolveDefinitionFilePath());
  const stateProvider = definition.resolveStateProvider();

  await Container.getInstance().get<StateManagementService, any>(StateManagementService, {
    args: [stateProvider.type],
  });

  return { stateCheckInIntervalInMs: definition.resolveStateCheckInIntervalInMs() };
}

/**
 * @param quietStdout Keeps **stdout** free of everything but the command's own output. Set by
 * `run-action`, whose stdout is consumed by terraform's `data "external"` as JSON.
 *
 * It does not disable listeners — it routes them to stderr, so that the SDK resource-action path,
 * the only place resource actions actually execute, stays observable.
 */
export async function bootOcto({ quietStdout = false }: { quietStdout?: boolean } = {}): Promise<{
  app: App;
  octo: Octo;
}> {
  const definition = new YamlDefinitionUtility(resolveDefinitionFilePath());

  const hooks = await definition.resolveHooks();
  const imports = await definition.resolveImports();
  const listeners = await definition.resolveListeners({ logDestination: quietStdout ? 'stderr' : 'stdout' });
  const modules = definition.resolveModules(imports);
  const stateProvider = definition.resolveStateProvider();
  const tags = definition.resolveTags();
  const terraformOptions = definition.resolveTerraformOptions();

  if (!quietStdout) {
    console.log(chalk.green('Definition file is valid and all modules were successfully imported.'));
  }

  // Initialize.
  const octo = new Octo();
  await octo.initialize(
    stateProvider.type,
    listeners.map((l) => ({
      options: {
        args: l.args,
        metadata: l.metadata,
      },
      type: l.type,
    })),
  );

  // Register hooks.
  octo.registerHooks(hooks);

  // Register terraform config + providers.
  octo.registerTerraformConfig({
    minTerraformVersion: terraformOptions.requiredVersion,
    providers: terraformOptions.requiredProviders,
  });
  for (const provider of terraformOptions.providers) {
    octo.registerTerraformProvider(provider.providerType, provider.accountId, provider.regionId, provider.spec, {
      accountName: provider.accountName,
      setRegionAttribute: provider.setRegionAttribute,
    });
  }

  // Load modules.
  for (const moduleDefinition of modules) {
    octo.loadModule(moduleDefinition.moduleClass, moduleDefinition.moduleId, moduleDefinition.moduleInputs);
  }
  octo.orderModules(modules.map((m) => m.moduleClass));

  // Compose.
  await octo.compose();
  const app = octo.getRootModel();

  // Register tags. A module-scoped tag names a module that only exists once compose has run it.
  octo.registerTags(tags);

  return { app, octo };
}

/**
 * Makes the environment survive the trip into terraform's `local-exec`.
 *
 * An external resource shells back out to `octo` from the terraform that terragrunt runs -
 * `run-action` from its `local-exec` provisioner, `get-response` from its `data "external"` - and
 * those commands inherit this process's environment. Two things about it are wrong by default, and
 * both fail only after real infrastructure exists:
 *
 * - **`octo` is a bare binary name**, resolved through `PATH`. Invoking a binary by path -
 *   `node_modules/.bin/octo apply` - does not put its directory on `PATH` for child processes, so
 *   the callback dies with `octo: command not found`. The generated app runs the flow through
 *   package scripts, and `npm run` does put that directory on `PATH`, but running the binary
 *   directly is still supported and has to work the same. The project's bin directory is prepended
 *   here, and the directory this CLI is running from after it, so a globally installed or linked
 *   octo still wins over nothing at all.
 * - **`OCTO_DEFINITION_FILE_PATH` is usually relative** (`octo.yaml` - the package scripts set
 *   exactly that), and terraform runs `local-exec` with a terragrunt cache directory as its cwd,
 *   where that resolves to nothing. It is made absolute here, against the cwd the user actually
 *   invoked from.
 */
export function prepareCallbackEnvironment(): void {
  const definitionFilePath = process.env.OCTO_DEFINITION_FILE_PATH;
  if (definitionFilePath) {
    process.env.OCTO_DEFINITION_FILE_PATH = resolve(process.cwd(), definitionFilePath);
  }

  const binDirectories = [resolve(process.cwd(), 'node_modules', '.bin'), dirname(process.argv[1] ?? '')].filter(
    (directory) => directory && existsSync(directory),
  );
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  process.env.PATH = [...binDirectories.filter((d) => !pathEntries.includes(d)), ...pathEntries].join(delimiter);
}

/**
 * Prints an octo error to stderr, including the properties it carries - the diff that matched no
 * action, most of all - which a bare stack trace would hide.
 */
export function reportError(error: any): void {
  console.error(chalk.red(error.stack));
  for (const errorProperty of Object.getOwnPropertyNames(error) || []) {
    if (errorProperty !== 'message' && errorProperty !== 'stack') {
      // Serialized rather than interpolated: the properties worth attaching to an octo error are
      // objects - the diff that matched no action, most of all - and `${}` renders those as
      // "[object Object]", which hides the only thing that would identify the node and field.
      const value = error[errorProperty];
      const renderedValue =
        value !== null && typeof value === 'object' ? JSON.stringify(value, undefined, 2) : String(value);
      console.error(chalk.red(`${errorProperty}: ${renderedValue}`));
    }
  }

  const failures: string[] = error.failures || [];
  if (failures.length > 0) {
    console.error('\n');
    console.error(chalk.red('FAILURES'));
    console.error(chalk.red('========'));
  }
  for (let i = 0; i < failures.length; i++) {
    console.error(chalk.red(`${i + 1}. ${failures[i]}`));
  }
}
