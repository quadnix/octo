import { Environment } from './environment.model.js';

export interface IEnvironment {
  environmentName: Environment['environmentName'];
  environmentVariables: { [key: string]: string };
}
