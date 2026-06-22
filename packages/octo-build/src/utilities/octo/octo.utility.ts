import { existsSync } from 'fs';
import { resolve } from 'path';
import { type App, Octo } from '@quadnix/octo';
import chalk from 'chalk';
import { YamlDefinitionUtility } from '../definition/yaml/yaml-definition.utility.js';

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

export async function bootOcto({ noConsole = false }: { noConsole?: boolean } = {}): Promise<{
  app: App;
  octo: Octo;
}> {
  const definition = new YamlDefinitionUtility(resolveDefinitionFilePath());

  const hooks = await definition.resolveHooks();
  const imports = await definition.resolveImports();
  const listeners = noConsole ? [] : await definition.resolveListeners();
  const modules = definition.resolveModules(imports);
  const stateProvider = definition.resolveStateProvider();
  const terraform = definition.resolveTerraformOptions();

  if (!noConsole) {
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
    minTerraformVersion: terraform.version,
    providers: terraform.requiredProviders,
  });
  for (const provider of terraform.providers) {
    octo.registerTerraformProvider(provider.providerType, provider.accountId, provider.regionId, provider.spec, {
      setRegionAttribute: provider.setRegionAttribute,
    });
  }

  // Load modules.
  for (const moduleDefinition of modules) {
    octo.loadModule(moduleDefinition.moduleClass, moduleDefinition.moduleId, moduleDefinition.moduleInputs);
  }
  octo.orderModules(modules.map((m) => m.moduleClass));

  // Compose.
  const appModuleId = modules[0].moduleId;
  const initializedModules = await octo.compose();
  const app = initializedModules[`${appModuleId}.model.app`] as App;

  return { app, octo };
}

export function reportError(error: any): void {
  console.error(chalk.red(error.stack));
  for (const errorProperty of Object.getOwnPropertyNames(error) || []) {
    if (errorProperty !== 'message' && errorProperty !== 'stack') {
      console.error(chalk.red(`${errorProperty}: ${error[errorProperty]}`));
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
