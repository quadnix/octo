import type { Environment } from './environment.model.js';

/**
 * {@link Environment} model interface.
 *
 * @group Model Interfaces
 */
export interface IEnvironment {
  environmentName: Environment['environmentName'];
  environmentVariables: { [key: string]: string };
}
