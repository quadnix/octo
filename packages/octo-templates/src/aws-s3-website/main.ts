import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { type App, Container, LocalStateProvider, Octo } from '@quadnix/octo';
import { EventLoggerListener } from '@quadnix/octo-event-listeners';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const octoStatePath = join(__dirname, '.octo');

const octo = new Octo();
const stateProvider = new LocalStateProvider(octoStatePath);
await octo.initialize(stateProvider, [{ type: EventLoggerListener }]);

const container = Container.getInstance();
const moduleDefinitions = await container.get(ModuleDefinitions);
for (const moduleDefinition of moduleDefinitions.getAll()) {
  octo.loadModule(moduleDefinition.module, moduleDefinition.moduleId, moduleDefinition.moduleInputs);
}
octo.orderModules(moduleDefinitions.getAll().map((m) => m.module));

const { 'app-module.model.app': app } = (await octo.compose()) as { 'app-module.model.app': App };
const transaction = octo.beginTransaction(app);
await transaction.next();
